import { Assistant } from "@slack/bolt";
import type { TaskUpdateChunk } from "@slack/web-api";
import { convertToModelMessages, smoothStream } from "ai";
import { createSlackAgent } from "@/lib/ai/agent";
import { createSlackMCPClient, type MCPClient } from "@/lib/bolt/mcp";
import { getThreadContextAsModelMessages } from "@/lib/bolt/thread-utils";
import { buildToolLabelMap } from "@/lib/bolt/tool-labels";

async function upsertTask(
  tasksMap: Map<string, TaskUpdateChunk>,
  streamer: { append: (args: { chunks: TaskUpdateChunk[] }) => Promise<unknown> },
  id: string,
  title: string,
  status: TaskUpdateChunk["status"],
): Promise<void> {
  tasksMap.set(id, { type: "task_update", id, title, status });
  await streamer.append({ chunks: [...tasksMap.values()] });
}

export const assistant = new Assistant({
  threadStarted: async ({
    logger,
    say,
    setSuggestedPrompts,
    getThreadContext,
    client,
  }) => {
    try {
      await say("Hi, how can I help?");
      const { channel_id } = await getThreadContext();
      let channelName = "";
      if (channel_id) {
        const channel = await client.conversations.info({
          channel: channel_id,
        });
        channelName = channel.channel?.name ?? "";
      }

      const prompts = [
        {
          title: "What can you help with?",
          message: "What kinds of things can you help me with?",
        },
        ...(channelName
          ? [
              {
                title: `Summarize #${channelName}`,
                message: `Can you summarize the recent activity in #${channelName}?`,
              },
            ]
          : []),
      ];

      await setSuggestedPrompts({ prompts });
    } catch (e) {
      logger.error(e);
    }
  },

  threadContextChanged: async ({ logger, saveThreadContext }) => {
    try {
      await saveThreadContext();
    } catch (e) {
      logger.warn("Failed to save thread context:", e);
    }
  },

  userMessage: async ({
    client,
    context,
    logger,
    message,
    say,
    setTitle,
    setStatus,
  }) => {
    if (
      !("text" in message) ||
      !message.text ||
      !("thread_ts" in message) ||
      !message.thread_ts
    ) {
      logger.warn(
        "userMessage: skipping message with unexpected shape",
        message,
      );
      return;
    }

    const { channel, thread_ts } = message;
    const { userId, teamId, botId } = context;

    if (!userId || !teamId) {
      logger.warn("userMessage: missing userId or teamId in context");
      return;
    }

    const TITLE_MAX_LENGTH = 200;

    let mcpClient: MCPClient | undefined;
    let streamer: ReturnType<typeof client.chatStream> | undefined;
    let streamerStopped = false;
    try {
      await setStatus("is thinking...");
      mcpClient = await createSlackMCPClient({
        userToken: process.env.SLACK_USER_TOKEN ?? "",
      });
      await setTitle(message.text.slice(0, TITLE_MAX_LENGTH));

      const [threadMessages, tools, schema] = await Promise.all([
        getThreadContextAsModelMessages({
          client,
          channel,
          ts: thread_ts,
          oldest: thread_ts,
          botId,
        }),
        mcpClient.tools(),
        mcpClient.listTools(),
      ]);

      const toolLabelMap = buildToolLabelMap(schema.tools);

      const agent = createSlackAgent(tools);

      streamer = client.chatStream({
        channel,
        thread_ts,
        recipient_team_id: teamId,
        recipient_user_id: userId,
        task_display_mode: "plan",
      });

      const result = await agent.stream({
        messages: await convertToModelMessages(threadMessages),
        experimental_transform: smoothStream({ chunking: "word" }),
      });

      const tasksMap = new Map<TaskUpdateChunk["id"], TaskUpdateChunk>();

      for await (const part of result.fullStream) {
        if (part.type === "tool-input-start") {
          await upsertTask(
            tasksMap,
            streamer,
            part.id,
            toolLabelMap.get(part.toolName)?.inProgress ?? part.toolName,
            "in_progress",
          );
        } else if (part.type === "tool-result") {
          await upsertTask(
            tasksMap,
            streamer,
            part.toolCallId,
            toolLabelMap.get(part.toolName)?.complete ??
              tasksMap.get(part.toolCallId)?.title ??
              part.toolName,
            "complete",
          );
        } else if (part.type === "tool-error") {
          await upsertTask(
            tasksMap,
            streamer,
            part.toolCallId,
            tasksMap.get(part.toolCallId)?.title ?? part.toolName,
            "error",
          );
        } else if (part.type === "text-delta") {
          await streamer?.append({ markdown_text: part.text });
        }
      }

      await streamer.stop({
        chunks: [...tasksMap.values()],
      });
      streamerStopped = true;
    } catch (e) {
      logger.error(e);

      await say({
        text: `:warning: Sorry, something went wrong!`,
        metadata: {
          event_type: "assistant_error",
          event_payload: { error: e instanceof Error ? e.message : "Unknown error" },
        },
      });
      if (!streamerStopped) {
        await streamer
          ?.stop({})
          .catch((e) => logger.error("Failed to stop streamer:", e));
      }
    } finally {
      await mcpClient
        ?.close()
        .catch((e) => logger.error("Failed to close MCP client:", e));
    }
  },
});
