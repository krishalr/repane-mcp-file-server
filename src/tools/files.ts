import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveSafe, assertNotGitDir, assertNotProtected } from "../sandbox.js";
import { MAX_FILE_BYTES } from "../config.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function registerFileTools(server: McpServer) {
  server.registerTool(
    "list_files",
    {
      description: "List files and folders in a directory inside the workspace. Folders end with '/'.",
      inputSchema: { path: z.string().default(".").describe("Directory relative to workspace root") },
    },
    async ({ path: p }) => {
      const dir = await resolveSafe(p);
      assertNotGitDir(dir);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const lines = entries
        .filter((e) => e.name !== ".git")
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return text(lines.join("\n") || "(empty)");
    }
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a UTF-8 text file from the workspace (max 1 MB).",
      inputSchema: { path: z.string() },
    },
    async ({ path: p }) => {
      const abs = await resolveSafe(p);
      assertNotGitDir(abs);
      const stat = await fs.stat(abs);
      if (!stat.isFile()) throw new Error("Not a file");
      if (stat.size > MAX_FILE_BYTES) throw new Error(`File too large (${stat.size} bytes, max ${MAX_FILE_BYTES})`);
      return text(await fs.readFile(abs, "utf8"));
    }
  );

  server.registerTool(
    "write_file",
    {
      description: "Create or overwrite a file (parent folders are created). Prefer str_replace for small edits.",
      inputSchema: { path: z.string(), content: z.string() },
    },
    async ({ path: p, content }) => {
      const abs = await resolveSafe(p);
      assertNotGitDir(abs);
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > MAX_FILE_BYTES) throw new Error(`Content too large (${bytes} bytes, max ${MAX_FILE_BYTES})`);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
      return text(`Wrote ${bytes} bytes to ${p}`);
    }
  );

  server.registerTool(
    "str_replace",
    {
      description:
        "Replace exactly one occurrence of old_str with new_str in a file. Fails if old_str is not found or appears more than once; include more surrounding context to make it unique.",
      inputSchema: { path: z.string(), old_str: z.string().min(1), new_str: z.string() },
    },
    async ({ path: p, old_str, new_str }) => {
      const abs = await resolveSafe(p);
      assertNotGitDir(abs);
      const original = await fs.readFile(abs, "utf8");
      const count = original.split(old_str).length - 1;
      if (count === 0) throw new Error("old_str not found in file");
      if (count > 1) throw new Error(`old_str matches ${count} times; add more context so it is unique`);
      const updated = original.replace(old_str, () => new_str);
      if (Buffer.byteLength(updated, "utf8") > MAX_FILE_BYTES) throw new Error("Result would exceed size limit");
      await fs.writeFile(abs, updated, "utf8");
      return text(`Replaced 1 occurrence in ${p}`);
    }
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file in the workspace. Handoff files cannot be deleted.",
      inputSchema: { path: z.string() },
    },
    async ({ path: p }) => {
      const abs = await resolveSafe(p);
      assertNotGitDir(abs);
      assertNotProtected(abs);
      const stat = await fs.stat(abs);
      if (!stat.isFile()) throw new Error("Only files can be deleted");
      await fs.unlink(abs);
      return text(`Deleted ${p}`);
    }
  );
}