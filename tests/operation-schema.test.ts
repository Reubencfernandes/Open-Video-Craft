import { describe, expect, it } from "vitest";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";

describe("operationSchema", () => {
  it("accepts every operation type the reducer supports", () => {
    const valid = [
      { type: "remove_ranges", ranges: [{ start: 1, end: 2 }], ripple: true },
      { type: "split_clip", segmentId: "seg", at: 3 },
      { type: "trim_clip", segmentId: "seg", timelineEnd: 9 },
      { type: "delete_clip", segmentId: "seg", ripple: false },
      { type: "move_clip", segmentId: "seg", timelineStart: 4 },
      { type: "sequence_clips", segmentIds: ["a", "b"], start: 0, gap: 0.5 },
      { type: "set_audio", itemId: "item", gainDb: -6, muted: false },
      { type: "set_audio_lane", lane: 2, gainDb: -12, muted: true },
      { type: "set_master_volume", volume: 72 },
      { type: "set_background_audio", itemIds: ["music"] },
      { type: "set_layout", layoutMode: "side-by-side" },
      { type: "set_background", style: "gradient-2", category: "gradient" },
      { type: "set_camera", size: 30, position: "top-right", shape: "rounded" },
      { type: "set_screen", position: { x: 4, y: -3, scale: 90 }, aspectRatio: "16:9" },
      {
        type: "set_text_overlay",
        overlay: { id: "title", start: 0, end: 2, text: "Hello", x: 50, y: 20, size: 64, color: "#ffffff", weight: 700, animation: "fade" }
      },
      { type: "remove_text_overlay", id: "title" },
      { type: "set_subtitle_preferences", language: "English", style: "boxed" },
      { type: "set_editor_view", previewQuality: "low", timelineZoom: 2.5, previewZoom: 1.2 },
      { type: "import_media", paths: ["/tmp/clip.mp4"], placement: "timeline", timelineStart: 4 },
      { type: "generate_music", engine: "lyria-pro", prompt: "Quiet ambient bed", lyrics: "" },
      {
        type: "set_zoom", id: "z1", start: 1, end: 3, speed: "medium",
        scale: 2, targetX: 50, targetY: 50
      },
      { type: "remove_zoom", id: "z1" },
      { type: "set_speed", id: "s1", start: 0, end: 5, rate: 2 },
      { type: "remove_speed", id: "s1" },
      {
        type: "set_transition", fromSegmentId: "a", toSegmentId: "b",
        transition: "crossfade", duration: 0.5
      },
      { type: "remove_transition", fromSegmentId: "a", toSegmentId: "b" },
      {
        type: "replace_subtitles", language: "English", style: "clean",
        segments: [{ id: "sub", start: 0, end: 1, text: "hi" }]
      },
      { type: "update_subtitle", id: "sub", text: "hello" },
      { type: "set_export_range", start: 0, end: 30 }
    ];
    for (const operation of valid) {
      expect(operationSchema.safeParse(operation).success, JSON.stringify(operation)).toBe(true);
    }
  });

  it("rejects out-of-range and malformed operations", () => {
    const invalid = [
      { type: "remove_ranges", ranges: [], ripple: true },
      { type: "remove_ranges", ranges: [{ start: 1, end: 2 }], ripple: false },
      { type: "set_zoom", id: "z", start: 0, end: 1, speed: "medium", scale: 9, targetX: 50, targetY: 50 },
      { type: "set_speed", id: "s", start: 0, end: 1, rate: 7 },
      { type: "set_transition", fromSegmentId: "a", toSegmentId: "b", transition: "spin", duration: 0.5 },
      { type: "set_audio", itemId: "item", gainDb: 40, muted: false },
      { type: "set_audio_lane", lane: -1, gainDb: 0, muted: false },
      { type: "set_master_volume", volume: 101 },
      { type: "set_camera", size: 90 },
      { type: "set_text_overlay", overlay: { id: "bad", start: 0, end: 1, text: "x", x: 50, y: 50, size: 64, color: "white", weight: 700, animation: "none" } },
      { type: "set_editor_view", timelineZoom: 20 },
      { type: "import_media", paths: [], placement: "media-bin" },
      { type: "generate_music", engine: "acestep", prompt: "music" },
      { type: "explode_timeline" }
    ];
    for (const operation of invalid) {
      expect(operationSchema.safeParse(operation).success, JSON.stringify(operation)).toBe(false);
    }
  });
});
