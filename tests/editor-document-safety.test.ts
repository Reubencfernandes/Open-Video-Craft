import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDefaultEditorState, createEditorDocument } from "../src/shared/editor-domain";
import { readEditorDocument, saveEditorDocument, withEditorLock } from "../src/main/editor-document-store";

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-document-safety-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it.each(["null", '{"schemaVersion":99}', '{"schemaVersion":2,"state":{}}', '{"broken":'])
  ("refuses to overwrite an invalid existing editor file: %s", async (content) => {
    const target = path.join(root, "editor.json");
    await fs.writeFile(target, content);
    await expect(readEditorDocument(root)).rejects.toThrow();
    await expect(saveEditorDocument({ rootPath: root, baseRevision: 0, state: createDefaultEditorState(), imports: [], source: "editor" })).rejects.toThrow();
    expect(await fs.readFile(target, "utf8")).toBe(content);
  });

it("rejects saved imports outside their canonical project path", async () => {
  const document = createEditorDocument({ imports: [{ id: "clip", name: "clip.mp4", kind: "video", extension: "mp4", duration: 1, relativePath: "../outside.mp4" }] });
  await fs.writeFile(path.join(root, "editor.json"), JSON.stringify(document));
  await expect(readEditorDocument(root)).rejects.toThrow(/preserved/);
});

it("does not retry an operation that fails with EEXIST", async () => {
  const operation = vi.fn(async () => { throw Object.assign(new Error("operation failed"), { code: "EEXIST" }); });
  await expect(withEditorLock(root, operation)).rejects.toThrow("operation failed");
  expect(operation).toHaveBeenCalledTimes(1);
  await expect(fs.stat(path.join(root, ".ovc", "editor.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["empty", "live but old"])("does not steal a %s lock", async (kind) => {
  const lock = path.join(root, ".ovc", "editor.lock");
  await fs.mkdir(path.dirname(lock));
  await fs.writeFile(lock, kind === "empty" ? "" : JSON.stringify({ pid: process.pid, createdAt: Date.now() - 60_000 }));
  let entered = false;
  const waiting = withEditorLock(root, async () => { entered = true; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(entered).toBe(false);
  await fs.rm(lock);
  await waiting;
  expect(entered).toBe(true);
});
