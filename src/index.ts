import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { ensureHandoffFiles } from "./tools/handoff.js";
import { PORT, AUTH_TOKEN, WORKSPACE_ROOT } from "./config.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Optional bearer token auth
app.use("/mcp", (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.headers.authorization === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
});

// Stateless Streamable HTTP: a fresh server + transport per request
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const methodNotAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

await ensureHandoffFiles();
app.listen(PORT, () => {
  console.log(`MCP server: http://localhost:${PORT}/mcp`);
  console.log(`Workspace:  ${WORKSPACE_ROOT}`);
  console.log(`Auth:       ${AUTH_TOKEN ? "bearer token required" : "disabled"}`);
});