import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveSafe } from "../sandbox.js";
import { WORKSPACE_ROOT, MAX_FILE_BYTES } from "../config.js";

const SKIP = new Set([".git", "node_modules"]);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full; // symlinks are skipped on purpose
  }
}

export function registerSearchTools(server: McpServer) {
  server.registerTool(
    "search_files",
    {
      description: "Case-insensitive text search across files in the workspace. Returns path:line: text.",
      inputSchema: {
        query: z.string().min(1),
        path: z.string().default(".").describe("Directory to search in"),
        max_results: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ query, path: p, max_results }) => {
      const start = await resolveSafe(p);
      const needle = query.toLowerCase();
      const hits: string[] = [];
      outer: for await (const file of walk(start)) {
        const stat = await fs.stat(file);
        if (stat.size > MAX_FILE_BYTES) continue;
        let content: string;
        try {
          content = await fs.readFile(file, "utf8");
        } catch {
          continue;
        }
        if (content.includes("\0")) continue; // skip binary
        const rel = path.relative(WORKSPACE_ROOT, file);
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (hits.length >= max_results) break outer;
          }
        }
      }
      return { content: [{ type: "text" as const, text: hits.join("\n") || "No matches" }] };
    }
  );
}