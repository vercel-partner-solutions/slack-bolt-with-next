import { devToolsMiddleware } from "@ai-sdk/devtools";
import { openai } from "@ai-sdk/openai";
import {
  gateway,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
  wrapLanguageModel,
} from "ai";

const model = wrapLanguageModel({
  model: gateway("openai/gpt-5-mini"),
  middleware:
    process.env.NODE_ENV === "production" ? [] : [devToolsMiddleware()],
});

const SYSTEM_INSTRUCTIONS = `You are a helpful assistant in a Slack workspace.
Human messages are prefixed with [User <SLACK_USER_ID>] so you can distinguish
between multiple participants in the same thread. Respond professionally and concisely.
When you include markdown, convert it to Slack-compatible formatting.
Preserve any Slack special syntax like <@USER_ID> or <#CHANNEL_ID> as-is.`;

export const createSlackAgent = (tools: ToolSet) =>
  new ToolLoopAgent({
    model,
    instructions: SYSTEM_INSTRUCTIONS,
    tools: {
      ...tools,
      web_search: openai.tools.webSearch({ needsApproval: true }),
    },
    stopWhen: stepCountIs(10),
  });
