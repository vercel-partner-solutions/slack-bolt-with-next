import { gateway } from "@ai-sdk/gateway";
import { ToolLoopAgent, type ToolSet } from "ai";

const SYSTEM_INSTRUCTIONS = `You are a helpful assistant in a Slack workspace.
Human messages are prefixed with [User <SLACK_USER_ID>] so you can distinguish
between multiple participants in the same thread. Respond professionally and concisely.
When you include markdown, convert it to Slack-compatible formatting.
Preserve any Slack special syntax like <@USER_ID> or <#CHANNEL_ID> as-is.`;

export const createSlackAgent = (tools: ToolSet) =>
  new ToolLoopAgent({
    model: gateway("openai/gpt-4o-mini"),
    instructions: SYSTEM_INSTRUCTIONS,
    tools,
  });
