import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { resolveContainedProjectPath } from "../src/main/project-containment";
import { saveEditorDocument } from "../src/main/editor-document-store";
import { createDefaultEditorState } from "../src/shared/editor-domain";

let directory: string;
let root: string;
let outside: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-containment-"));
  root = path.join(directory, "project");
  outside = path.join(directory, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

it("allows project files that do not yet exist and rejects traversal", () => {
  expect(resolveContainedProjectPath(root, "imports/new.mp4")).toBe(path.join(root, "imports", "new.mp4"));
  expect(() => resolveContainedProjectPath(root, "../outside/secret.mp4")).toThrow(/outside/);
});

it("rejects reads and writes through an external media junction", async () => {
  await fs.writeFile(path.join(outside, "secret.mp4"), "private");
  await fs.symlink(outside, path.join(root, "imports"), process.platform === "win32" ? "junction" : "dir");
  expect(() => resolveContainedProjectPath(root, "imports/secret.mp4")).toThrow(/outside/);
  expect(() => resolveContainedProjectPath(root, "imports/new.mp4")).toThrow(/outside/);
});

it("refuses editor writes through an external metadata junction", async () => {
  await fs.symlink(outside, path.join(root, ".ovc"), process.platform === "win32" ? "junction" : "dir");
  await expect(saveEditorDocument({ rootPath: root, baseRevision: 0, state: createDefaultEditorState(), imports: [], source: "editor" })).rejects.toThrow(/outside/);
  expect(await fs.readdir(outside)).toEqual([]);
});

it("allows links whose resolved target stays within the selected project", async () => {
  const media = path.join(root, "media");
  await fs.mkdir(media);
  await fs.symlink(media, path.join(root, "imports"), process.platform === "win32" ? "junction" : "dir");
  expect(resolveContainedProjectPath(root, "imports/new.mp4")).toBe(path.join(root, "imports", "new.mp4"));
});
