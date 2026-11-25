import { describe, expect, it } from "vitest";

import { moveTimelineSegment } from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

const clip = (id: string, lane: number, start: number, end: number): TimelineSegment => ({
  id,
  itemId: `item-${id}`,
  track: "video",
  lane,
  start,
  end,
  sourceStart: 0
});

describe("moving clips between channels", () => {
  it("drops a video clip on another channel even where that channel already has footage", () => {
    const segments = [clip("main", 0, 0, 10), clip("second", 1, 0, 10)];
    const moved = moveTimelineSegment(segments, "main", 0, 30, [], 1);

    expect(moved.find((segment) => segment.id === "main")?.lane).toBe(1);
    // Other channels do not compete for space, so nothing was pushed away.
    expect(moved.find((segment) => segment.id === "second")?.lane).toBe(1);
  });

  it("keeps the clip on its own channel where a same-channel clip already sits", () => {
    const segments = [clip("a", 0, 0, 4), clip("b", 0, 8, 12)];
    const moved = moveTimelineSegment(segments, "b", 2, 30, [], 0);

    const b = moved.find((segment) => segment.id === "b");
    expect(b?.lane).toBe(0);
    // It cannot overlap "a", so the free-gap clamp keeps it after that clip.
    expect(b!.start).toBeGreaterThanOrEqual(4);
  });

  it("moves an audio clip onto the requested audio channel", () => {
    const audio = (id: string, lane: number, start: number, end: number): TimelineSegment => ({
      id,
      itemId: `item-${id}`,
      track: "audio",
      lane,
      start,
      end,
      sourceStart: 0
    });
    const moved = moveTimelineSegment([audio("mic", 0, 0, 5)], "mic", 0, 30, [], 2);
    expect(moved.find((segment) => segment.id === "mic")?.lane).toBe(2);
  });
});

describe("dragging a group across channels", () => {
  it("moves every selected video clip by the same channel delta", async () => {
    const { moveTimelineSegmentGroup } = await import("../src/renderer/editor/timeline-utils");
    const segments = [
      { id: "a", itemId: "a", track: "video" as const, lane: 0, start: 0, end: 4, sourceStart: 0 },
      { id: "b", itemId: "b", track: "video" as const, lane: 1, start: 6, end: 10, sourceStart: 0 }
    ];
    const moved = moveTimelineSegmentGroup(segments, ["a", "b"], 0, 30, [], 0.1, 1);

    expect(moved.map((segment) => segment.lane)).toEqual([1, 2]);
    expect(moved.map((segment) => segment.start)).toEqual([0, 6]);
  });

  it("does not treat clips on other channels as a conflict", async () => {
    const { moveTimelineSegmentGroup } = await import("../src/renderer/editor/timeline-utils");
    const segments = [
      { id: "a", itemId: "a", track: "video" as const, lane: 0, start: 0, end: 4, sourceStart: 0 },
      { id: "b", itemId: "b", track: "video" as const, lane: 2, start: 0, end: 4, sourceStart: 0 }
    ];
    // Channel 1 is empty even though channel 2 has footage at the same moment.
    const moved = moveTimelineSegmentGroup(segments, ["a"], 0, 30, [], 0.1, 1);
    expect(moved.find((segment) => segment.id === "a")).toMatchObject({ lane: 1, start: 0, end: 4 });
  });

  it("refuses to stack two clips on the same channel at the same time", async () => {
    const { moveTimelineSegmentGroup } = await import("../src/renderer/editor/timeline-utils");
    const segments = [
      { id: "a", itemId: "a", track: "video" as const, lane: 0, start: 0, end: 4, sourceStart: 0 },
      { id: "b", itemId: "b", track: "video" as const, lane: 1, start: 0, end: 4, sourceStart: 0 }
    ];
    const moved = moveTimelineSegmentGroup(segments, ["a"], 0, 30, [], 0.1, 1);
    const a = moved.find((segment) => segment.id === "a");
    expect(a!.lane).toBe(1);
    expect(a!.start).toBeGreaterThanOrEqual(4);
  });
});
