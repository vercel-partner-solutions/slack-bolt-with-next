import type { TextStreamPart, ToolSet } from "ai";
import type { AgentProjection, Step } from "@/lib/agent-stream";
import type {
  CreateCanvasOutput,
  ReadCanvasOutput,
  ReadMessagesOutput,
  ReadUserProfileOutput,
  SearchResultsOutput,
  SendMessageDraftOutput,
  SendMessageOutput,
} from "@/lib/bolt/slack-tool-outputs";
import type { ToolLabels } from "@/lib/bolt/tool-labels";

export function extractOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  const content = (output as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => (c as { type?: string }).type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n");
}

export type ToolProjection = (
  input: unknown,
  output: unknown,
  step: Step,
  title: string,
) => void;

type ToolName =
  | "web_search"
  | "slack_send_message"
  | "slack_send_message_draft"
  | "slack_schedule_message"
  | "slack_create_canvas"
  | "slack_search_public"
  | "slack_search_public_and_private"
  | "slack_search_channels"
  | "slack_search_users"
  | "slack_read_channel"
  | "slack_read_thread"
  | "slack_read_user_profile"
  | "slack_read_canvas";

export const toolProjections = {
  web_search(_input, output, step, title) {
    const { action, sources = [] } = output as {
      action?: { query?: string };
      sources?: Array<{ url: string; title?: string }>;
    };
    for (const s of sources) {
      try {
        const { hostname, pathname } = new URL(s.url);
        const host = hostname.replace(/^www\./, "");
        step.source(
          s.url,
          s.title ??
            (pathname && pathname !== "/" ? `${host}${pathname}` : host),
        );
      } catch {
        step.source(s.url, s.url);
      }
    }
    step.complete({
      title,
      details: action?.query ? `Searching for ${action.query}` : undefined,
      output: sources.length
        ? `Found ${sources.length} result${sources.length === 1 ? "" : "s"}`
        : undefined,
    });
  },

  slack_send_message(input, output, step, title) {
    const { message } = input as { message?: string };
    const { message_link } = JSON.parse(
      extractOutputText(output),
    ) as SendMessageOutput;
    step.complete({
      title,
      details: message
        ? message.length > 60
          ? `${message.slice(0, 60)}…`
          : message
        : undefined,
      output: message_link,
    });
  },

  slack_send_message_draft(input, output, step, title) {
    const { message } = input as { message?: string };
    const { channel_link } = JSON.parse(
      extractOutputText(output),
    ) as SendMessageDraftOutput;
    step.complete({
      title,
      details: message
        ? message.length > 60
          ? `${message.slice(0, 60)}…`
          : message
        : undefined,
      output: channel_link,
    });
  },

  slack_schedule_message(input, output, step, title) {
    const { message } = input as { message?: string };
    const { message_link } = JSON.parse(
      extractOutputText(output),
    ) as SendMessageOutput;
    step.complete({
      title,
      details: message
        ? message.length > 60
          ? `${message.slice(0, 60)}…`
          : message
        : undefined,
      output: message_link,
    });
  },

  slack_create_canvas(input, output, step, title) {
    const { title: canvasTitle } = input as { title?: string };
    const { canvas_url } = JSON.parse(
      extractOutputText(output),
    ) as CreateCanvasOutput;
    step.complete({ title, details: canvasTitle, output: canvas_url });
  },

  slack_search_public(input, output, step, title) {
    const { query } = input as { query?: string };
    const { results } = JSON.parse(
      extractOutputText(output),
    ) as SearchResultsOutput;
    const n = Number(results?.match(/\((\d+) results?\)/i)?.[1]);
    step.complete({
      title,
      details: query ? `"${query}"` : undefined,
      output: n ? `Found ${n} result${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_search_public_and_private(input, output, step, title) {
    const { query } = input as { query?: string };
    const { results } = JSON.parse(
      extractOutputText(output),
    ) as SearchResultsOutput;
    const n = Number(results?.match(/\((\d+) results?\)/i)?.[1]);
    step.complete({
      title,
      details: query ? `"${query}"` : undefined,
      output: n ? `Found ${n} result${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_search_channels(input, output, step, title) {
    const { query } = input as { query?: string };
    const { results } = JSON.parse(
      extractOutputText(output),
    ) as SearchResultsOutput;
    const n = Number(results?.match(/Channels \((\d+)/i)?.[1]);
    for (const [, label, url] of results?.matchAll(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    ) ?? []) {
      if (label === "link") {
        try {
          const { hostname, pathname } = new URL(url);
          step.source(
            url,
            pathname && pathname !== "/" ? `${hostname}${pathname}` : hostname,
          );
        } catch {
          step.source(url, url);
        }
      }
    }
    step.complete({
      title,
      details: query ? `"${query}"` : undefined,
      output: n ? `Found ${n} channel${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_search_users(input, output, step, title) {
    const { query } = input as { query?: string };
    const { results } = JSON.parse(
      extractOutputText(output),
    ) as SearchResultsOutput;
    const n = Number(results?.match(/Users \((\d+)/i)?.[1]);
    for (const [, label, url] of results?.matchAll(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    ) ?? []) {
      if (label === "link") {
        try {
          const { hostname, pathname } = new URL(url);
          step.source(
            url,
            pathname && pathname !== "/" ? `${hostname}${pathname}` : hostname,
          );
        } catch {
          step.source(url, url);
        }
      }
    }
    step.complete({
      title,
      details: query ? `"${query}"` : undefined,
      output: n ? `Found ${n} user${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_read_channel(_input, output, step, title) {
    const { messages } = JSON.parse(
      extractOutputText(output),
    ) as ReadMessagesOutput;
    const n = messages?.split("Message TS:").length - 1;
    step.complete({
      title,
      output: n > 0 ? `Read ${n} message${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_read_thread(_input, output, step, title) {
    const { messages } = JSON.parse(
      extractOutputText(output),
    ) as ReadMessagesOutput;
    const n = messages?.split("Message TS:").length - 1;
    step.complete({
      title,
      output: n > 0 ? `Read ${n} message${n === 1 ? "" : "s"}` : undefined,
    });
  },

  slack_read_user_profile(_input, output, step, title) {
    const { result } = JSON.parse(
      extractOutputText(output),
    ) as ReadUserProfileOutput;
    const name =
      result?.match(/Display Name: (.+)/)?.[1]?.trim() ||
      result?.match(/Real Name: (.+)/)?.[1]?.trim();
    step.complete({ title, output: name });
  },

  slack_read_canvas(_input, output, step, title) {
    const { canvas_id } = JSON.parse(
      extractOutputText(output),
    ) as ReadCanvasOutput;
    step.complete({ title, details: canvas_id });
  },
} satisfies Record<ToolName, ToolProjection>;

export function createToolLoopProjection(
  toolLabelMap: Map<string, ToolLabels>,
): AgentProjection<TextStreamPart<ToolSet>> {
  const stepTitle = (name: string) =>
    name === "web_search"
      ? "Searching the web..."
      : (toolLabelMap.get(name)?.inProgress ?? name);
  const doneTitle = (name: string) =>
    name === "web_search"
      ? "Web search completed"
      : (toolLabelMap.get(name)?.complete ?? name);

  const reasoningStart = new Map<string, number>();

  return (part, ctx) => {
    switch (part.type) {
      case "reasoning-start":
        reasoningStart.set(part.id, Date.now());
        ctx.addStep(part.id, "Thinking...");
        break;
      case "reasoning-end": {
        const elapsed = Math.round(
          (Date.now() - (reasoningStart.get(part.id) ?? Date.now())) / 1000,
        );
        reasoningStart.delete(part.id);
        ctx.getStep(part.id)?.complete({
          title: `Thought for ${elapsed} second${elapsed === 1 ? "" : "s"}`,
        });
        break;
      }
      case "tool-input-start":
        ctx.addStep(part.id, stepTitle(part.toolName));
        break;
      case "tool-result": {
        const step = ctx.getStep(part.toolCallId);
        const title = doneTitle(part.toolName);
        const project = toolProjections[part.toolName as ToolName];
        if (project && step) {
          try {
            project(part.input, part.output, step, title);
          } catch {
            step.complete({ title });
          }
        } else {
          step?.complete({ title });
        }
        break;
      }
      case "tool-error":
        ctx.getStep(part.toolCallId)?.error();
        break;
      case "text-delta":
        ctx.appendMarkdown(part.text);
        break;
    }
  };
}
