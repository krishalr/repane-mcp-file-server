import "dotenv/config";
import path from "node:path";

export const PORT = Number(process.env.PORT ?? 3000);
export const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_ROOT ?? "./workspace");
export const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";
export const MAX_FILE_BYTES = 1_000_000; // 1 MB cap for reads and writes

export const HANDOFF_FILES = [
  "PROJECT_STATE.md",
  "PLAN_LOG.md",
  "CHECKPOINTS.md",
  "DECISIONS.md",
];