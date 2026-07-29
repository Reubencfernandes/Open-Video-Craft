/**
 * A project whose timeline holds several video clips must render through the
 * compositor. Both regressions covered here made the export fall back to the
 * single-source path, which encodes one file and silently drops the rest.
 */
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

vi.mock("../src/main/composition-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/main/composition-export")>()),
  exportEditorProjectToPath: mocks.exportEditorProjectToPath
}));

import { exportEditorVideo, type EditorExportContext } from "../src/main/editor-export";

let directory: string;
let outputPath: string;

const PROJECT = { id: "project-1", name: "test", rootPath: "/projects/test" };

/** Two imported clips laid end to end, the shape that lost its second video. */
const TIMELINE_DOCUMENT = {
  state: {
    timelineSegments: [
      { id: "a:1", itemId: "a", track: "video", lane: 0, start: 0, end: 66.6, sourceStart: 0 },
      { id: "b:1", itemId: "b", track: "video", lane: 0, start: 66.6, end: 136.7, sourceStart: 0 }
    ]
  }
};

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-export-timeline-test-"));
  outputPath = path.join(directory, "movie.mp4");
  mocks.chooseExportPath.mockReset();
  mocks.exportVideo.mockReset();
  mocks.exportEditorProjectToPath.mockReset();
  mocks.chooseExportPath.mockResolvedValue(outputPath);
  mocks.exportEditorProjectToPath.mockResolvedValue({
    path: outputPath,
    bytesWritten: 2048,
    subtitlePath: null
  });
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

/**
 * A project built purely from imported clips: `getMediaPath` finds no screen
 * recording, which is what made resolveExportSource throw.
 */
function importsOnlyContext(): EditorExportContext {
  return {
    projectStore: {
      getProject: () => PROJECT,
      getMediaPath: () => null,
      readEditorState: async () => TIMELINE_DOCUMENT
    } as unknown as EditorExportContext["projectStore"],
    importedMediaCache: new Map([["a", path.join(directory, "a.mp4")]]),
    getDialogParentWindow: () => null
  };
}

function projectRequest(): ExportVideoRequest {
  return {
    source: { kind: "project", projectId: PROJECT.id },
    format: "mp4",
    resolution: "source",
    trimStart: 0,
    trimEnd: 136.7,
    volume: 1,
    audioLevels: {},
    backgroundAudioImportIds: [],
    subtitles: [],
    subtitleMode: "none",
    textOverlays: []
  } as unknown as ExportVideoRequest;
}

describe("project timeline export", () => {
  it("renders through the compositor when the project has no screen recording", async () => {
    const result = await exportEditorVideo(projectRequest(), importsOnlyContext());

    // The single-source path would encode only the first clip.
    expect(mocks.exportEditorProjectToPath).toHaveBeenCalledTimes(1);
    expect(mocks.exportVideo).not.toHaveBeenCalled();
    expect(result?.bytesWritten).toBe(2048);
  });

  it("passes every video segment to the compositor", async () => {
    await exportEditorVideo(projectRequest(), importsOnlyContext());

    const [call] = mocks.exportEditorProjectToPath.mock.calls;
    expect(call[0].document.state.timelineSegments).toHaveLength(2);
    expect(call[0].project).toBe(PROJECT);
  });

  it("names the save dialog after the project, not a screen recording", async () => {
    await exportEditorVideo(projectRequest(), importsOnlyContext());

    expect(mocks.chooseExportPath.mock.calls[0][1]).toMatchObject({ name: "test" });
  });

  it("falls back to the single-source path when the timeline has no video", async () => {
    const context = importsOnlyContext();
    context.projectStore.readEditorState = (async () => ({
      state: { timelineSegments: [] }
    })) as unknown as EditorExportContext["projectStore"]["readEditorState"];
    mocks.exportVideo.mockResolvedValue(1024);

    // No timeline to composite, so the screen-recording requirement applies again.
    await expect(exportEditorVideo(projectRequest(), context)).rejects.toThrow(
      /screen recording/
    );
    expect(mocks.exportEditorProjectToPath).not.toHaveBeenCalled();
  });
});
