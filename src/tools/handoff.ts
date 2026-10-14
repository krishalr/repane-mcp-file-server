import fs from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_ROOT, HANDOFF_FILES } from "../config.js";

/** Create the four handoff files at startup if they are missing. */
export async function ensureHandoffFiles(): Promise<void> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  for (const name of HANDOFF_FILES) {
    const p = path.join(WORKSPACE_ROOT, name);
    try {
      await fs.access(p);
    } catch {
      await fs.writeFile(p, `# ${name.replace(".md", "")}\n\n`);
    }
  }
}

/** Shown to every connecting client so agents follow the handoff convention. */
export const HANDOFF_INSTRUCTIONS = `
This server gives you a sandboxed workspace shared across agent sessions.
HANDOFF PROTOCOL:
- At the START of every session, call read_file on PROJECT_STATE.md first (then PLAN_LOG.md, DECISIONS.md if needed).
- While working, append decisions to DECISIONS.md and verified milestones (with commit hash) to CHECKPOINTS.md.
- At the END of every session: overwrite PROJECT_STATE.md (goal, done, in progress, next), append to PLAN_LOG.md, then git_commit.
- Prefer str_replace over write_file for small edits.
`.trim();