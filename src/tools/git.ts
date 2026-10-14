import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveSafe } from "../sandbox.js";
import { WORKSPACE_ROOT } from "../config.js";

const run = promisify(execFile);
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

async function requireRepo() {
  try {
    await fs.access(path.join(WORKSPACE_ROOT, ".git"));
  } catch {
    throw new Error("The workspace is not a git repo. Run `git init` inside the workspace folder.");
  }
}

// execFile with an args array: no shell, so user input cannot inject commands.
async function git(args: string[]): Promise<string> {
  await requireRepo();
  const { stdout, stderr } = await run("git", args, { cwd: WORKSPACE_ROOT, maxBuffer: 1024 * 1024 });
  return stdout || stderr || "(no output)";
}

export function registerGitTools(server: McpServer) {
  server.registerTool(
    "git_status",
    { description: "Show working tree status of the workspace repo (short format).", inputSchema: {} },
    async () => text(await git(["status", "--short", "--branch"]))
  );

  server.registerTool(
    "git_diff",
    {
      description: "Show uncommitted changes, optionally limited to one path.",
      inputSchema: { path: z.string().optional() },
    },
    async ({ path: p }) => {
      const args = ["diff"];
      if (p) args.push("--", path.relative(WORKSPACE_ROOT, await resolveSafe(p)));
      return text(await git(args));
    }
  );

  server.registerTool(
    "git_log",
    {
      description: "Show recent commits (one line each).",
      inputSchema: { limit: z.number().int().min(1).max(100).default(10) },
    },
    async ({ limit }) => text(await git(["log", "--oneline", "-n", String(limit)]))
  );

  server.registerTool(
    "git_commit",
    {
      description: "Stage all changes in the workspace and commit with the given message.",
      inputSchema: { message: z.string().trim().min(1).max(200) },
    },
    async ({ message }) => {
      await git(["add", "-A"]);
      try {
        return text(await git(["commit", "-m", message]));
      } catch (e: any) {
        if (String(e.stdout ?? "").includes("nothing to commit")) return text("Nothing to commit");
        throw e;
      }
    }
  );
}