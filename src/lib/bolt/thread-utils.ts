import type {
  ConversationsRepliesArguments,
  ConversationsRepliesResponse,
} from "@slack/web-api";
import type { SlackUIMessage } from "./types";

type SlackMessage = NonNullable<
  ConversationsRepliesResponse["messages"]
>[number];

// Minimal interface to avoid version conflicts between @slack/web-api instances
interface ConversationsClient {
  conversations: {
    replies(
      args: ConversationsRepliesArguments,
    ): Promise<ConversationsRepliesResponse>;
  };
}

export const getThreadContext = async (
  args: ConversationsRepliesArguments,
  client: ConversationsClient,
): Promise<SlackMessage[]> => {
  const result = await client.conversations.replies(args);
  return result.messages ?? [];
};

export const getThreadContextAsModelMessages = async (
  args: ConversationsRepliesArguments & {
    botId?: string;
    client: ConversationsClient;
  },
): Promise<SlackUIMessage[]> => {
  const { botId, client, ...repliesArgs } = args;
  const messages = await getThreadContext(repliesArgs, client);

  return messages.map((message: SlackMessage) => {
    const { bot_id, text, user, ts, thread_ts, type } = message;
    // If botId provided, match exactly; otherwise treat any bot message as assistant
    const isAssistant = botId ? bot_id === botId : !!bot_id;
    // Inject a sender tag into user messages so the LLM can distinguish
    // multiple participants (e.g. User A vs User B) in the same thread
    const senderTag = !isAssistant && user ? `[User ${user}]` : null;
    const content = senderTag ? `${senderTag}: ${text ?? ""}` : (text ?? "");
    return {
      id: ts ?? crypto.randomUUID(),
      role: isAssistant ? "assistant" : "user",
      content,
      parts: [{ type: "text", text: content }],
      metadata: {
        user: user ?? null,
        bot_id: bot_id ?? null,
        ts,
        thread_ts,
        type,
      },
    };
  });
};
