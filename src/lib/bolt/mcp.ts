import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

// Slack's MCP server allows empty strings for optional params (e.g. thread_ts: "")
// but the Slack API rejects them. Strip all empty string values from tool inputs
// as a defensive fix until the MCP server schema adds minLength: 1 constraints.
function stripEmptyStrings(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(stripEmptyStrings);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => [k, stripEmptyStrings(v)]),
  );
}

function wrapTools(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: tool.execute
          ? (...args: Parameters<NonNullable<typeof tool.execute>>) => {
              const [input, options] = args;
              return tool.execute?.(
                stripEmptyStrings(input) as typeof input,
                options,
              );
            }
          : tool.execute,
      },
    ]),
  );
}

export const createSlackMCPClient = async ({
  userToken,
}: {
  userToken: string;
}) => {
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

  return {
    tools: async () => wrapTools(await client.tools()),
    listTools: () => client.listTools(),
    close: () => client.close(),
  };
};

export type MCPClient = Awaited<ReturnType<typeof createSlackMCPClient>>;
