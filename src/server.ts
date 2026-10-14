import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFileTools } from "./tools/files.js";
import { registerSearchTools } from "./tools/search.js";
import { registerGitTools } from "./tools/git.js";
import { HANDOFF_INSTRUCTIONS } from "./tools/handoff.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "repane-mcp-file-server", version: "1.0.0" },
    { instructions: HANDOFF_INSTRUCTIONS }
  );
  registerFileTools(server);
  registerSearchTools(server);
  registerGitTools(server);
  return server;
}