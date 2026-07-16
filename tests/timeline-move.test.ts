import { describe, expect, it } from "vitest";
import {
  getTimelineSegmentIdsInRange,
  moveTimelineSegment,
  moveTimelineSegmentGroup
} from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

function videoSegment(id: string, start: number, end: number): TimelineSegment {
  return { id, itemId: `item-${id}`, track: "video", lane: 0, start, end, sourceStart: 0 };
}

function segmentById(segments: TimelineSegment[], id: string): TimelineSegment {
  const segment = segments.find((item) => item.id === id);
  if (!segment) {
    throw new Error(`missing segment ${id}`);
  }
  return segment;
}

describe("moveTimelineSegment", () => {
  it("stops a video clip against its neighbor instead of overlapping", () => {
    const segments = [videoSegment("a", 0, 4), videoSegment("b", 6, 10)];
    const moved = moveTimelineSegment(segments, "a", 3.5, 20);
    const a = segmentById(moved, "a");
    expect(a.start).toBeCloseTo(2);
    expect(a.end).toBeCloseTo(6);
  });

  it("jumps to the gap on the far side once the pointer is closer to it", () => {
    const segments = [videoSegment("a", 0, 2), videoSegment("b", 3, 9)];
    const moved = moveTimelineSegment(segments, "a", 8.5, 30);
    const a = segmentById(moved, "a");
    expect(a.start).toBeCloseTo(9);
  });

  it("holds a boxed-in clip until the pointer favors the far gap, then jumps past it", () => {
    const segments = [
      videoSegment("a", 0, 10),
      videoSegment("b", 10, 12),
      videoSegment("c", 12, 22)
    ];
    // Dragging over "c": while the pointer is nearer its own slot, "b" stays put…
    const held = segmentById(moveTimelineSegment(segments, "b", 15, 40), "b");
    expect(held.start).toBeCloseTo(10);
    // …and once the pointer is nearer the gap after "c", it jumps across.
    const jumped = segmentById(moveTimelineSegment(segments, "b", 19, 40), "b");
    expect(jumped.start).toBeCloseTo(22);
  });

  it("snaps the clip edge to an extra target such as the playhead", () => {
    const segments = [videoSegment("a", 0, 2)];
    const moved = moveTimelineSegment(segments, "a", 5.05, 20, [5]);
    const a = segmentById(moved, "a");
    expect(a.start).toBeCloseTo(5);
  });
});

describe("timeline range selection", () => {
  it("selects every clip touched by the marked time range", () => {
    const segments = [
      videoSegment("a", 0, 3),
      videoSegment("b", 4, 7),
      videoSegment("c", 8, 10)
    ];
    expect(getTimelineSegmentIdsInRange(segments, 2, 8)).toEqual(["a", "b"]);
    expect(getTimelineSegmentIdsInRange(segments, 8, 2)).toEqual(["a", "b"]);
  });

  it("moves a selected group with its spacing intact", () => {
    const segments = [videoSegment("a", 0, 2), videoSegment("b", 3, 5)];
    const moved = moveTimelineSegmentGroup(segments, ["a", "b"], 4, 20);
    expect(segmentById(moved, "a")).toMatchObject({ start: 4, end: 6 });
    expect(segmentById(moved, "b")).toMatchObject({ start: 7, end: 9 });
  });

  it("stops a selected group at an unselected video clip", () => {
    const segments = [
      videoSegment("a", 0, 2),
      videoSegment("b", 2, 4),
      videoSegment("blocker", 7, 10)
    ];
    const moved = moveTimelineSegmentGroup(segments, ["a", "b"], 5, 20);
    expect(segmentById(moved, "a").start).toBeCloseTo(3);
    expect(segmentById(moved, "b").end).toBeCloseTo(7);
  });
});
