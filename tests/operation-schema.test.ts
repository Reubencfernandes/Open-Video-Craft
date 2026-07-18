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
      { type: "explode_timeline" }
    ];
    for (const operation of invalid) {
      expect(operationSchema.safeParse(operation).success, JSON.stringify(operation)).toBe(false);
    }
  });
});
