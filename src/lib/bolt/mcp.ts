import { createMCPClient } from "@ai-sdk/mcp";

export const createSlackMCPClient = ({ userToken }: { userToken: string }) =>
  createMCPClient({
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
