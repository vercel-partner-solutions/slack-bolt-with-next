import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

function stripEmptyStrings(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(stripEmptyStrings);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => [k, stripEmptyStrings(v)]),
  );
}

type Execute = NonNullable<ToolSet[string]["execute"]>;

function cleanExecute(execute: Execute): Execute {
  return (input, options) =>
    execute(stripEmptyStrings(input) as typeof input, options);
}

/**
 * Wraps MCP tools to strip empty-string values from inputs before execution.
 *
 * Slack's MCP server allows empty strings for optional params (e.g. `thread_ts: ""`)
 * but the Slack API rejects them. This recursively removes all empty-string values
 * as a defensive fix until the MCP server fixes this.
 */
export function fixSlackTools(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      tool.execute ? { ...tool, execute: cleanExecute(tool.execute) } : tool,
    ]),
  );
}

export const createSlackMCPClient = async ({
  userToken,
}: {
  userToken: string;
}): Promise<MCPClient> => {
  const client = await createMCPClient({
    name: "slack-mcp-app",
    version: "1.0.0",
    transport: {
      type: "http",
      url: "https://mcp.slack.com/mcp",
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
  });

  return client;
};
