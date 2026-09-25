// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEditorExport } from "../src/renderer/editor/useEditorExport";
import type { ProjectView } from "../src/shared/types";

let root: ReturnType<typeof createRoot>;
let state: ReturnType<typeof useEditorExport>;
let params: Parameters<typeof useEditorExport>[0];
const exportVideo = vi.fn(async () => null);
const cancelExport = vi.fn(async () => true);
const savedProject = { id: "project" } as ProjectView;

function Harness() { state = useEditorExport(params); return null; }
beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(window, "openVideoCraft", { configurable: true, value: {
    editor: { exportVideo, cancelExport, onExportProgress: () => () => undefined }
  } });
  params = {
    audioLevels: {}, backgroundAudioIds: [], masterVolume: 100, project: savedProject, projectScreen: null,
    hasVideoTimeline: true,
    selectedItem: { id: "import", importId: "import", origin: "imported", track: "imported", kind: "video", duration: 10, name: "clip", url: "clip.mp4" },
    setError: vi.fn(), setExportMessage: vi.fn(), subtitles: [], trimRange: { start: 3, end: 8 },
    beforeExport: vi.fn(async () => savedProject)
  };
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("exports the saved timeline even when an imported clip is selected", async () => {
  await act(async () => state.exportCurrentVideo());
  expect(exportVideo).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: "project", projectId: "project" }, trimStart: 3, trimEnd: 8 }));
});

it("uses the project created by the first save", async () => {
  params.project = null;
  await act(async () => root.render(createElement(Harness)));
  await act(async () => state.exportCurrentVideo());
  expect(exportVideo).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: "project", projectId: "project" } }));
});

it("does not export an older snapshot after saving fails", async () => {
  params.beforeExport = vi.fn(async () => { throw new Error("Disk full"); });
  await act(async () => root.render(createElement(Harness)));
  await act(async () => state.exportCurrentVideo());
  expect(exportVideo).not.toHaveBeenCalled();
  expect(params.setError).toHaveBeenLastCalledWith("Disk full");
});

it("honors cancellation during save and prevents duplicate exports", async () => {
  let finishSave!: (project: ProjectView) => void;
  params.beforeExport = vi.fn(() => new Promise<ProjectView>((resolve) => { finishSave = resolve; }));
  await act(async () => root.render(createElement(Harness)));
  let exporting!: Promise<void>;
  act(() => { exporting = state.exportCurrentVideo(); });
  await act(async () => state.exportCurrentVideo());
  expect(params.beforeExport).toHaveBeenCalledOnce();
  await act(async () => state.cancelExport());
  await act(async () => { finishSave(savedProject); await exporting; });
  expect(exportVideo).not.toHaveBeenCalled();
  expect(state.exporting).toBe(false);
});
