import path from "node:path";
import fs from "node:fs/promises";
import { WORKSPACE_ROOT, HANDOFF_FILES } from "./config.js";

function escapes(rel: string): boolean {
  return rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);
}

/**
 * Resolve a user-supplied path against the workspace root.
 * Throws if the path (or any symlink along it) leaves the root.
 */
export async function resolveSafe(userPath: string, root: string = WORKSPACE_ROOT): Promise<string> {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, userPath);

  if (escapes(path.relative(absRoot, abs))) {
    throw new Error("Path escapes workspace root");
  }

  // Symlink defense: realpath the nearest existing ancestor and re-check.
  const realRoot = await fs.realpath(absRoot);
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (escapes(path.relative(realRoot, real))) {
        throw new Error("Symlink escapes workspace root");
      }
      break;
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return abs;
}

export function assertNotGitDir(abs: string, root: string = WORKSPACE_ROOT): void {
  const parts = path.relative(path.resolve(root), abs).split(path.sep);
  if (parts.includes(".git")) throw new Error("Access to .git is not allowed");
}

export function assertNotProtected(abs: string, root: string = WORKSPACE_ROOT): void {
  const rel = path.relative(path.resolve(root), abs);
  if (HANDOFF_FILES.includes(rel)) {
    throw new Error(`${rel} is a handoff file and cannot be deleted`);
  }
}