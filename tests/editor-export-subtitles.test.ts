import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportVideoRequest } from "../src/shared/types";

const mocks = vi.hoisted(() => ({
  chooseExportPath: vi.fn(),
  exportVideo: vi.fn(),
  exportEditorProjectToPath: vi.fn()
}));

vi.mock("../src/main/file-dialogs", () => ({
  chooseExportPath: mocks.chooseExportPath
}));

vi.mock("../src/main/ffmpeg", () => ({
  exportVideo: mocks.exportVideo
}));

vi.mock("../src/main/composition-export", () => ({
  exportEditorProjectToPath: mocks.exportEditorProjectToPath
}));

import {
  exportEditorVideo,
  type EditorExportContext
} from "../src/main/editor-export";
import { SubtitleSidecarExistsError } from "../src/main/subtitle-export";

let directory: string;
let outputPath: string;
let context: EditorExportContext;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-editor-export-test-"));
  outputPath = path.join(directory, "movie.mp4");
  mocks.chooseExportPath.mockReset();
  mocks.exportVideo.mockReset();
  mocks.exportEditorProjectToPath.mockReset();
  mocks.chooseExportPath.mockResolvedValue(outputPath);
  context = {
    projectStore: {} as EditorExportContext["projectStore"],
    importedMediaCache: new Map([["source", path.join(directory, "source.mp4")]]),
    getDialogParentWindow: () => null
  };
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

function request(subtitleMode: "burn-in" | "sidecar" | "none"): ExportVideoRequest {
  return {
    source: { kind: "import", importId: "source" },
    format: "mp4",
    resolution: "source",
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    audioLevels: {},
    backgroundAudioImportIds: [],
    subtitles: [{ start: 0.25, end: 1.5, text: "Hello" }],
    subtitleMode
  };
}

describe("raw/import editor subtitle export", () => {
  it("reserves a sidecar before encoding", async () => {
    const subtitlePath = path.join(directory, "movie.srt");
    let sidecarSeenDuringEncode = false;
    mocks.exportVideo.mockImplementation(async () => {
      sidecarSeenDuringEncode = (await fs.readFile(subtitlePath, "utf8")).includes("Hello");
      return 123;
    });

    const result = await exportEditorVideo(request("sidecar"), context);

    expect(sidecarSeenDuringEncode).toBe(true);
    expect(result).toEqual({ path: outputPath, bytesWritten: 123, subtitlePath });
  });

  it("does not start encoding when the requested sidecar already exists", async () => {
    const subtitlePath = path.join(directory, "movie.srt");
    await fs.writeFile(outputPath, "existing video", "utf8");
    await fs.writeFile(subtitlePath, "existing subtitles", "utf8");

    await expect(exportEditorVideo(request("sidecar"), context)).rejects.toBeInstanceOf(
      SubtitleSidecarExistsError
    );

    expect(mocks.exportVideo).not.toHaveBeenCalled();
    await expect(fs.readFile(outputPath, "utf8")).resolves.toBe("existing video");
    await expect(fs.readFile(subtitlePath, "utf8")).resolves.toBe("existing subtitles");
  });

  it("removes its reserved sidecar and partial video when encoding fails", async () => {
    const subtitlePath = path.join(directory, "movie.srt");
    mocks.exportVideo.mockImplementation(async () => {
      await fs.writeFile(outputPath, "partial video", "utf8");
      throw new Error("encode failed");
    });

    await expect(exportEditorVideo(request("sidecar"), context)).rejects.toThrow("encode failed");

    await expect(fs.access(subtitlePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes a scoped temporary SRT for burn-in and cleans it afterward", async () => {
    let temporarySubtitlePath: string | null = null;
    mocks.exportVideo.mockImplementation(async (job: { subtitlePath?: string | null }) => {
      temporarySubtitlePath = job.subtitlePath ?? null;
      expect(temporarySubtitlePath).not.toBe(path.join(directory, "movie.srt"));
      await expect(fs.readFile(temporarySubtitlePath as string, "utf8")).resolves.toContain("Hello");
      return 456;
    });

    const result = await exportEditorVideo(request("burn-in"), context);

    expect(result).toEqual({ path: outputPath, bytesWritten: 456, subtitlePath: null });
    expect(temporarySubtitlePath).not.toBeNull();
    await expect(fs.access(temporarySubtitlePath as string)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(directory, "movie.srt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cleans the scoped burn-in SRT when encoding fails", async () => {
    let temporarySubtitlePath: string | null = null;
    mocks.exportVideo.mockImplementation(async (job: { subtitlePath?: string | null }) => {
      temporarySubtitlePath = job.subtitlePath ?? null;
      await expect(fs.access(temporarySubtitlePath as string)).resolves.toBeUndefined();
      throw new Error("burn-in failed");
    });

    await expect(exportEditorVideo(request("burn-in"), context)).rejects.toThrow("burn-in failed");

    expect(temporarySubtitlePath).not.toBeNull();
    await expect(fs.access(temporarySubtitlePath as string)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(directory, "movie.srt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not create or pass subtitles in none mode", async () => {
    mocks.exportVideo.mockImplementation(async (job: { subtitlePath?: string | null }) => {
      expect(job.subtitlePath).toBeNull();
      return 789;
    });

    const result = await exportEditorVideo(request("none"), context);

    expect(result).toEqual({ path: outputPath, bytesWritten: 789, subtitlePath: null });
    await expect(fs.access(path.join(directory, "movie.srt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
