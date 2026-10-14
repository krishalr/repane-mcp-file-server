import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSafe, assertNotGitDir, assertNotProtected } from "../src/sandbox.js";

let tmp: string;
let root: string;
let outside: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
  root = path.join(tmp, "workspace");
  outside = path.join(tmp, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "secret");
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("resolveSafe", () => {
  it("allows normal paths", async () => {
    expect(await resolveSafe("notes/a.txt", root)).toBe(path.join(root, "notes", "a.txt"));
    expect(await resolveSafe(".", root)).toBe(root);
  });

  it("rejects ../ escapes", async () => {
    await expect(resolveSafe("../outside/secret.txt", root)).rejects.toThrow();
    await expect(resolveSafe("foo/../../outside", root)).rejects.toThrow();
  });

  it("rejects absolute paths outside the root", async () => {
    await expect(resolveSafe("/etc/passwd", root)).rejects.toThrow();
    await expect(resolveSafe(path.join(outside, "secret.txt"), root)).rejects.toThrow();
  });

  it("rejects symlinks that point outside the root", async (ctx) => {
    const link = path.join(root, "link");
    try {
      await fs.symlink(outside, link, "dir");
    } catch {
      return ctx.skip(); // symlinks may need admin rights on Windows
    }
    await expect(resolveSafe("link/secret.txt", root)).rejects.toThrow();
    await expect(resolveSafe("link/new-file.txt", root)).rejects.toThrow();
  });
});

describe("guards", () => {
  it("blocks .git access", () => {
    expect(() => assertNotGitDir(path.join(root, ".git", "config"), root)).toThrow();
    expect(() => assertNotGitDir(path.join(root, "src", "a.ts"), root)).not.toThrow();
  });

  it("protects handoff files from deletion", () => {
    expect(() => assertNotProtected(path.join(root, "PROJECT_STATE.md"), root)).toThrow();
    expect(() => assertNotProtected(path.join(root, "other.md"), root)).not.toThrow();
  });
});