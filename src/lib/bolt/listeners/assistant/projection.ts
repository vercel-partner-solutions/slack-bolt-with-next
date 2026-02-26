import type { TextStreamPart, ToolSet } from "ai";
import type { AgentProjection } from "@/lib/agent-stream";
import type { ToolLabels } from "@/lib/bolt/tool-labels";

function sourceLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    return pathname && pathname !== "/" ? `${host}${pathname}` : host;
  } catch {
    return url;
  }
}

export function createToolLoopProjection(
  toolLabelMap: Map<string, ToolLabels>,
): AgentProjection<TextStreamPart<ToolSet>> {
  const getStepTitle = (toolName: string): string => {
    if (toolName === "web_search") return "Searching the web...";
    return toolLabelMap.get(toolName)?.inProgress ?? toolName;
  };

  const getCompletedTitle = (toolName: string): string => {
    if (toolName === "web_search") return "Web search completed";
    return toolLabelMap.get(toolName)?.complete ?? toolName;
  };

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
        ctx.addStep(part.id, getStepTitle(part.toolName));
        break;
      case "tool-result": {
        const step = ctx.getStep(part.toolCallId);
        if (part.toolName === "web_search") {
          const output = part.output as {
            action?: { query?: string };
            sources?: Array<{ url: string; title?: string }>;
          };
          for (const s of output.sources ?? []) {
            step?.source(s.url, s.title ?? sourceLabel(s.url));
          }
          const sourceCount = output.sources?.length ?? 0;
          step?.complete({
            title: getCompletedTitle(part.toolName),
            details: output.action?.query
              ? `Searching for ${output.action.query}`
              : undefined,
            output:
              sourceCount > 0
                ? `Found ${sourceCount} result${sourceCount === 1 ? "" : "s"}`
                : undefined,
          });
        } else {
          step?.complete({
            title: getCompletedTitle(part.toolName),
          });
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
