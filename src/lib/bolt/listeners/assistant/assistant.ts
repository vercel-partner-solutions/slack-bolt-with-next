import { Assistant } from "@slack/bolt";
import { convertToModelMessages } from "ai";
import { createSlackAgent } from "@/lib/ai/agent";
import { createSlackMCPClient } from "@/lib/bolt/mcp";
import { getThreadContextAsModelMessages } from "@/lib/bolt/thread-utils";

export const assistant = new Assistant({
  threadStarted: async ({
    event,
    logger,
    say,
    setSuggestedPrompts,
    saveThreadContext,
  }) => {
    const { context } = event.assistant_thread;
    try {
      await say("Hi, how can I help?");
      await saveThreadContext();

      const prompts: { title: string; message: string }[] = [
        {
          title: "What can you help with?",
          message: "What kinds of things can you help me with?",
        },
      ];

      if (context.channel_id) {
        prompts.push({
          title: "Summarize this channel",
          message: "Can you summarize the recent activity in this channel?",
        });
      }

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

    let mcpClient: Awaited<ReturnType<typeof createSlackMCPClient>> | undefined;
    try {
      mcpClient = await createSlackMCPClient({
        userToken: process.env.SLACK_USER_TOKEN ?? "",
      });
      await setTitle(message.text);
      await setStatus("thinking...");

      const [uiMessages, tools] = await Promise.all([
        getThreadContextAsModelMessages({
          client,
          channel,
          ts: thread_ts,
          oldest: thread_ts,
          botId,
        }),
        mcpClient.tools(),
      ]);

      const agent = createSlackAgent(tools);
      const streamer = client.chatStream({
        channel,
        thread_ts,
        recipient_team_id: teamId,
        recipient_user_id: userId,
      });

      const result = await agent.stream({
        messages: await convertToModelMessages(uiMessages),
      });

      for await (const chunk of result.textStream) {
        await streamer.append({ markdown_text: chunk });
      }

      await streamer.stop();
    } catch (e) {
      logger.error(e);

      await say({
        text: `:warning: Sorry, something went wrong!`,
        metadata: {
          event_type: "assistant_error",
          event_payload: { error: String(e) },
        },
      });
    } finally {
      await mcpClient
        ?.close()
        .catch((e) => logger.error("Failed to close MCP client:", e));
    }
  },
});
