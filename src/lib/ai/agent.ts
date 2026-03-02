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

## CRITICAL: URL formatting

Every URL in your response MUST use this exact Slack mrkdwn format:
  <https://the-url.com|anchor text>

The anchor text must be a meaningful word or phrase, never the raw URL itself.
The URL must always be inside angle brackets.

FORBIDDEN patterns — never produce these:
  View it here: https://slack.com/...          ← bare URL after a label
  [View it here](https://slack.com/...)        ← markdown link syntax
  https://slack.com/...                        ← bare URL anywhere in your text

REQUIRED pattern — always produce this instead:
  <https://slack.com/archives/C123/p456|View it here>  ← URL as an inline link in a sentence

When a tool returns a URL (message link, canvas link, etc.), embed it inline:
  WRONG:  "Message sent. View it here: https://..."
  RIGHT:  "Message sent. <https://...|View it here>."

## Slack mrkdwn formatting

- Bold: *text*  |  Italic: _text_  |  Strikethrough: ~text~
- Inline code: \`code\`  |  Code block: \`\`\`code\`\`\`
- Bullet: - item  |  Blockquote: > text
- User mention: <@U12345678>  |  Channel mention: <#C12345678>
- Never use standard markdown like **bold**, [link](url), or # headers`;

export const createSlackAgent = (tools: ToolSet) =>
  new ToolLoopAgent({
    model,
    instructions: SYSTEM_INSTRUCTIONS,
    providerOptions: {
      openai: {
        store: true,
      },
    },
    tools: {
      ...tools,
      web_search: openai.tools.webSearch(),
    },
    stopWhen: stepCountIs(10),
  });
