import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyEditorOperations,
  createDefaultEditorState,
  parseEditorDocument
} from "../src/shared/editor-domain";
import {
  applyAgentEdit,
  EditorRevisionConflictError,
  readEditorDocument,
  saveEditorDocument,
  undoAgentEdit
} from "../src/main/editor-document-store";

let rootPath: string;
beforeEach(async () => { rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-editor-domain-")); });
afterEach(async () => { await fs.rm(rootPath, { recursive: true, force: true }); });

describe("editor document migration", () => {
  it("migrates schema v1 without changing the saved snapshot", () => {
    const state = createDefaultEditorState();
    const migrated = parseEditorDocument({ schemaVersion: 1, savedAt: "2026-01-01T00:00:00.000Z", state, imports: [] });
    expect(migrated).toMatchObject({ schemaVersion: 2, revision: 0, state });
  });

  it("loads schema-v2 snapshots created before transitions were introduced", () => {
    const state = createDefaultEditorState();
    delete state.transitions;
    const loaded = parseEditorDocument({
      schemaVersion: 2,
      revision: 4,
      savedAt: "2026-01-01T00:00:00.000Z",
      state,
      imports: [],
      lastMutation: { source: "editor", at: "2026-01-01T00:00:00.000Z", editId: null, summary: null }
    });
    expect(loaded?.revision).toBe(4);
    expect(loaded?.state.transitions ?? []).toEqual([]);
  });

  it("loads schema-v2 snapshots created before text overlays were introduced", () => {
    const state = createDefaultEditorState();
    delete state.textOverlays;
    const loaded = parseEditorDocument({
      schemaVersion: 2,
      revision: 5,
      savedAt: "2026-01-01T00:00:00.000Z",
      state,
      imports: [],
      lastMutation: { source: "editor", at: "2026-01-01T00:00:00.000Z", editId: null, summary: null }
    });
    expect(loaded?.state.textOverlays ?? []).toEqual([]);
  });

  it("keeps older text overlays valid while accepting saved typography controls", () => {
    const state = createDefaultEditorState();
    state.textOverlays = [{
      id: "legacy-title",
      start: 1,
      end: 4,
      text: "Legacy title",
      x: 50,
      y: 30,
      size: 64,
      color: "#ffffff",
      weight: 700,
      animation: "none"
    }, {
      id: "styled-title",
      start: 5,
      end: 8,
      text: "Styled title",
      x: 50,
      y: 70,
      size: 72,
      color: "#ff4b73",
      fontFamily: "serif",
      opacity: 82,
      weight: 600,
      animation: "fade"
    }];
    const loaded = parseEditorDocument({
      schemaVersion: 2,
      revision: 6,
      savedAt: "2026-01-01T00:00:00.000Z",
      state,
      imports: [],
      lastMutation: { source: "editor", at: "2026-01-01T00:00:00.000Z", editId: null, summary: null }
    });

    expect(loaded?.state.textOverlays).toHaveLength(2);
    expect(loaded?.state.textOverlays?.[1]).toMatchObject({
      fontFamily: "serif",
      opacity: 82
    });
  });
});

describe("agent edit operations", () => {
  it("ripple-removes time across clips and subtitles", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "screen:segment-0", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 20, sourceStart: 0 },
        { id: "audio:segment-0", itemId: "audio", track: "audio" as const, lane: 0, start: 0, end: 20, sourceStart: 0 }
      ],
      subtitles: [
        { id: "one", start: 4, end: 10, text: "crosses cut" },
        { id: "two", start: 9, end: 12, text: "after cut" }
      ]
    };
    const result = applyEditorOperations(state, [
      { type: "remove_ranges", ranges: [{ start: 5, end: 8 }], ripple: true }
    ]);
    expect(result.duration).toBe(17);
    expect(result.state.timelineSegments.filter((item) => item.track === "video")).toMatchObject([
      { start: 0, end: 5, sourceStart: 0 },
      { start: 5, end: 17, sourceStart: 8 }
    ]);
    expect(result.state.subtitles).toMatchObject([
      { id: "one", start: 4, end: 7 },
      { id: "two", start: 6, end: 9 }
    ]);
  });

  it("converts dB gain into the editor's linear volume scale", () => {
    const result = applyEditorOperations(createDefaultEditorState(), [
      { type: "set_audio", itemId: "mic", gainDb: 6, muted: false }
    ]);
    expect(result.state.audioLevels.mic.volume).toBeCloseTo(199.53, 2);
  });

  it("applies composition, audio, text, and editor-view operations", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }
      ],
      trimRange: { start: 0, end: 10 }
    };
    const result = applyEditorOperations(state, [
      { type: "set_audio_lane", lane: 1, gainDb: -6, muted: true },
      { type: "set_master_volume", volume: 75 },
      { type: "set_background_audio", itemIds: ["music", "music"] },
      { type: "set_layout", layoutMode: "side-by-side" },
      { type: "set_background", style: "gradient-2", category: "gradient" },
      { type: "set_camera", size: 32, position: "top-right", shape: "rounded", borderStyle: "accent" },
      { type: "set_screen", position: { x: 5, y: -4, scale: 92 }, aspectRatio: "16:9", cornerStyle: "round" },
      {
        type: "set_text_overlay",
        overlay: { id: "title", start: 1, end: 3, text: "Demo", x: 50, y: 18, size: 72, color: "#ffcc00", weight: 700, animation: "pop" }
      },
      { type: "set_subtitle_preferences", language: "English", style: "boxed" },
      { type: "set_editor_view", previewQuality: "low", timelineZoom: 3, previewZoom: 1.25 }
    ]);

    expect(result.state).toMatchObject({
      masterVolume: 75,
      backgroundAudioIds: ["music"],
      layoutMode: "side-by-side",
      backgroundStyle: "gradient-2",
      activeBackgroundCategory: "gradient",
      cameraSize: 32,
      cameraPosition: "top-right",
      cameraShape: "rounded",
      cameraBorderStyle: "accent",
      screenPosition: { x: 5, y: -4, scale: 92 },
      screenAspectRatio: "16:9",
      videoCornerStyle: "round",
      subtitleLanguage: "English",
      subtitleStyle: "boxed",
      previewQuality: "low",
      timelineZoom: 3,
      previewZoom: 1.25
    });
    expect(result.state.audioLevels["audio-lane:1"]).toMatchObject({ muted: true });
    expect(result.state.audioLevels["audio-lane:1"].volume).toBeCloseTo(50.12, 2);
    expect(result.state.textOverlays).toMatchObject([{ id: "title", text: "Demo" }]);
  });

  it("queues renderer-owned media import and Lyria generation commands", () => {
    const imported = applyEditorOperations(createDefaultEditorState(), [{
      type: "import_media", paths: ["/tmp/clip.mp4"], placement: "timeline", timelineStart: 2
    }]);
    expect(imported.state.pendingMediaImport).toMatchObject({
      paths: ["/tmp/clip.mp4"], placement: "timeline", timelineStart: 2
    });
    expect(imported.state.pendingMediaImport?.requestId).toBeTruthy();

    const generated = applyEditorOperations(imported.state, [{
      type: "generate_music", engine: "lyria-pro", prompt: "  ambient underscore  ", lyrics: "instrumental"
    }]);
    expect(generated.state.pendingMusicGeneration).toMatchObject({
      engine: "lyria-pro", prompt: "ambient underscore", lyrics: "instrumental"
    });
    expect(generated.warnings).toContain("Music generation was queued for the open editor.");
  });

  it("adds, updates, and removes request-scoped zoom and speed effects", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }
      ],
      trimRange: { start: 0, end: 10 }
    };
    const added = applyEditorOperations(state, [
      {
        type: "set_zoom", id: "zoom-hook", start: 1, end: 3, speed: "fast",
        easing: "ease-out", scale: 1.8, targetX: 62, targetY: 38
      },
      { type: "set_speed", id: "speed-demo", start: 4, end: 6, rate: 3 }
    ]);
    expect(added.state.zoomEffects).toMatchObject([
      { id: "zoom-hook", start: 1, end: 3, scale: 1.8, targetX: 62, targetY: 38 }
    ]);
    expect(added.state.speedEffects).toEqual([
      { id: "speed-demo", start: 4, end: 6, rate: 3 }
    ]);
    expect(added.affectedClipIds).toEqual(["video"]);

    const updated = applyEditorOperations(added.state, [
      {
        type: "set_zoom", id: "zoom-hook", start: 1.5, end: 3.5, speed: "medium",
        scale: 2, targetX: 50, targetY: 50
      },
      { type: "remove_speed", id: "speed-demo" }
    ]);
    expect(updated.state.zoomEffects).toMatchObject([{ id: "zoom-hook", start: 1.5, end: 3.5, scale: 2 }]);
    expect(updated.state.speedEffects).toEqual([]);
  });

  it("rejects overlapping or out-of-timeline agent effects", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 5, sourceStart: 0 }
      ],
      zoomEffects: [
        { id: "existing", start: 1, end: 2, speed: "medium" as const, scale: 1.5, targetX: 50, targetY: 50 }
      ]
    };
    expect(() => applyEditorOperations(state, [{
      type: "set_zoom", id: "overlap", start: 1.5, end: 3, speed: "fast",
      scale: 2, targetX: 50, targetY: 50
    }])).toThrow(/overlap/);
    expect(() => applyEditorOperations(state, [{
      type: "set_speed", id: "outside", start: 4, end: 6, rate: 2
    }])).toThrow(/inside the video timeline/);
  });

  it("adds and removes a transition only at an adjacent clip cut", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video-a", itemId: "a", track: "video" as const, lane: 0, start: 0, end: 2, sourceStart: 0 },
        { id: "video-b", itemId: "b", track: "video" as const, lane: 0, start: 2, end: 4, sourceStart: 0 }
      ],
      trimRange: { start: 0, end: 4 }
    };
    const added = applyEditorOperations(state, [{
      type: "set_transition",
      fromSegmentId: "video-a",
      toSegmentId: "video-b",
      transition: "crossfade",
      duration: 0.6
    }]);
    expect(added.state.transitions).toMatchObject([{
      fromSegmentId: "video-a", toSegmentId: "video-b", type: "crossfade", duration: 0.6
    }]);
    const removed = applyEditorOperations(added.state, [{
      type: "remove_transition", fromSegmentId: "video-a", toSegmentId: "video-b"
    }]);
    expect(removed.state.transitions).toEqual([]);
  });

  it("rejects a transition across a timeline gap", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video-a", itemId: "a", track: "video" as const, lane: 0, start: 0, end: 2, sourceStart: 0 },
        { id: "video-b", itemId: "b", track: "video" as const, lane: 0, start: 3, end: 5, sourceStart: 0 }
      ]
    };
    expect(() => applyEditorOperations(state, [{
      type: "set_transition",
      fromSegmentId: "video-a",
      toSegmentId: "video-b",
      transition: "wipe-left",
      duration: 0.5
    }])).toThrow(/without a gap/);
  });

  it("sequences video clips with linked project audio and subtitles", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video-a", itemId: "project:screen", track: "video" as const, lane: 0, start: 0, end: 5, sourceStart: 0 },
        { id: "video-b", itemId: "project:screen", track: "video" as const, lane: 0, start: 5, end: 10, sourceStart: 5 },
        { id: "mic", itemId: "project:audio", track: "audio" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }
      ],
      subtitles: [
        { id: "first", start: 1, end: 2, text: "first" },
        { id: "second", start: 6, end: 7, text: "second" }
      ]
    };
    const result = applyEditorOperations(state, [
      { type: "sequence_clips", segmentIds: ["video-b", "video-a"], start: 0, gap: 0 }
    ]);
    expect(result.state.subtitles).toMatchObject([
      { text: "first", start: 6, end: 7 },
      { text: "second", start: 1, end: 2 }
    ]);
    expect(result.state.timelineSegments.filter((item) => item.track === "audio")).toMatchObject([
      { start: 0, end: 5, sourceStart: 5 },
      { start: 5, end: 10, sourceStart: 0 }
    ]);
  });
});

describe("editor transactions", () => {
  it("checks revisions, checkpoints one AI plan, and undoes it", async () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "screen:segment-0", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }
      ],
      trimRange: { start: 0, end: 10 }
    };
    const first = await saveEditorDocument({ rootPath, baseRevision: 0, state, imports: [], source: "editor" });
    expect(first.revision).toBe(1);
    await expect(saveEditorDocument({ rootPath, baseRevision: 0, state, imports: [], source: "editor" }))
      .rejects.toBeInstanceOf(EditorRevisionConflictError);

    const applied = await applyAgentEdit({
      rootPath, baseRevision: 1, summary: "Remove intro",
      operations: [{ type: "remove_ranges", ranges: [{ start: 0, end: 2 }], ripple: true }]
    });
    expect(applied.document.revision).toBe(2);
    expect(applied.document.lastMutation).toMatchObject({ source: "agent", editId: applied.editId });

    const restored = await undoAgentEdit({ rootPath, baseRevision: 2, editId: applied.editId });
    expect(restored.revision).toBe(3);
    expect(restored.state.timelineSegments).toEqual(state.timelineSegments);
    expect((await readEditorDocument(rootPath))?.revision).toBe(3);
  });

  it("recovers a stale lock before saving", async () => {
    await fs.mkdir(path.join(rootPath, ".ovc"), { recursive: true });
    await fs.writeFile(path.join(rootPath, ".ovc", "editor.lock"), JSON.stringify({ pid: 999999, createdAt: 0 }));
    await expect(saveEditorDocument({ rootPath, baseRevision: 0, state: createDefaultEditorState(), imports: [], source: "editor" }))
      .resolves.toMatchObject({ revision: 1 });
  });
});
