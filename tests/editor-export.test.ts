import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveFfmpegPath, mediaHasAudio } from "../src/main/ffmpeg";
import { ProjectStore } from "../src/main/project-store";
import { createDefaultEditorState } from "../src/shared/editor-domain";
import { exportEditorVideo } from "../src/main/editor-export";
import type { ExportVideoRequest } from "../src/shared/types";

const choosePath = vi.hoisted(() => vi.fn());
vi.mock("../src/main/file-dialogs", () => ({ chooseExportPath: choosePath }));
const exec = promisify(execFile);
let directory: string;
let video: string;
let music: string;
let output: string;
let store: ProjectStore;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-editor-export-"));
  video = path.join(directory, "silent.mp4");
  music = path.join(directory, "music.wav");
  output = path.join(directory, "export.mp4");
  store = new ProjectStore({ appVersion: "test" });
  choosePath.mockResolvedValue(output);
  await exec(resolveFfmpegPath(), ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
}, 60_000);
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

const request = (): ExportVideoRequest => ({
  source: { kind: "import", importId: "video" }, format: "mp4", resolution: "source", trimStart: 0, trimEnd: 0.5,
  volume: 1, audioLevels: {}, backgroundAudioImportIds: [], subtitles: [{ start: 0, end: 0.5, text: "Caption" }], subtitleMode: "none"
});
const context = () => ({ projectStore: store, importedMediaCache: new Map([["video", video], ["music", music]]), getDialogParentWindow: () => null });

it("exports silent video with background audio", async () => {
  await exec(resolveFfmpegPath(), ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", music]);
  const result = await exportEditorVideo({ ...request(), backgroundAudioImportIds: ["music"] }, context());
  expect(result!.bytesWritten).toBeGreaterThan(1000);
  expect(await mediaHasAudio(output)).toBe(true);
  expect(result!.subtitlePath).toBeNull();
  await expect(fs.stat(output.replace(".mp4", ".srt"))).rejects.toMatchObject({ code: "ENOENT" });
}, 60_000);

it("burns captions into a selected import without leaving a sidecar", async () => {
  const result = await exportEditorVideo({ ...request(), subtitleMode: "burn-in" }, context());
  expect(result!.bytesWritten).toBeGreaterThan(1000);
  expect(result!.subtitlePath).toBeNull();
}, 60_000);

it("exports an imported-only saved timeline without requiring a screen recording", async () => {
  const project = await store.createProject({ name: "Imported edit", baseDirectory: directory });
  await store.saveEditorState(project.id, {
    state: { ...createDefaultEditorState(), timelineSegments: [{ id: "clip", itemId: "video", track: "video", lane: 0, start: 0, end: 0.5, sourceStart: 0 }], trimRange: { start: 0, end: 0.5 } },
    imports: [{ id: "video", name: "silent.mp4", kind: "video", extension: "mp4", duration: 0.5 }]
  }, () => video);
  const result = await exportEditorVideo({ ...request(), source: { kind: "project", projectId: project.id }, resolution: "720p" }, context());
  expect(result!.bytesWritten).toBeGreaterThan(1000);
}, 60_000);
