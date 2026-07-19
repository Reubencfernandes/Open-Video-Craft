import { describe, expect, it } from "vitest";
import {
  getTimelineLaneIdsBetween,
  getTimelineRangeSelectionForSegments,
  getTimelineSegmentIdsInRange,
  isTimelineTimedItemInRange,
  moveTimelineSegment,
  moveTimelineSegmentGroup
} from "../src/renderer/editor/timeline-utils";
import type { TimelineLaneId, TimelineSegment } from "../src/renderer/editor/types";

function videoSegment(id: string, start: number, end: number): TimelineSegment {
  return { id, itemId: `item-${id}`, track: "video", lane: 0, start, end, sourceStart: 0 };
}

function audioSegment(id: string, lane: number, start: number, end: number): TimelineSegment {
  return { id, itemId: `item-${id}`, track: "audio", lane, start, end, sourceStart: 0 };
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
  it("selects only clips touched by both the marked time and chosen lane", () => {
    const segments = [
      videoSegment("a", 0, 3),
      videoSegment("b", 4, 7),
      videoSegment("c", 8, 10),
      audioSegment("music-0", 0, 1, 6),
      audioSegment("music-1", 1, 1, 6)
    ];
    expect(getTimelineSegmentIdsInRange(segments, 2, 8, ["video"])).toEqual(["a", "b"]);
    expect(getTimelineSegmentIdsInRange(segments, 8, 2, ["audio:1"])).toEqual(["music-1"]);
    expect(getTimelineSegmentIdsInRange(segments, 2, 8, ["video", "audio:0"])).toEqual([
      "a",
      "music-0",
      "b"
    ]);
  });

  it("does not select unrelated media when the marquee covers only effect lanes", () => {
    const segments = [videoSegment("video", 0, 10), audioSegment("audio", 0, 0, 10)];
    expect(getTimelineSegmentIdsInRange(segments, 2, 8, ["zoom", "speed"])).toEqual([]);
  });

  it("selects timed effects only inside their painted lane and time bounds", () => {
    const selection = { start: 2, end: 6, laneIds: ["zoom", "text"] as TimelineLaneId[] };
    expect(isTimelineTimedItemInRange(selection, "zoom", 4, 8)).toBe(true);
    expect(isTimelineTimedItemInRange(selection, "speed", 4, 8)).toBe(false);
    expect(isTimelineTimedItemInRange(selection, "text", 6, 9)).toBe(false);
  });

  it("rebuilds a moved group range from the clips' actual lanes and bounds", () => {
    const segments = [
      videoSegment("video", 5, 8),
      audioSegment("voice", 2, 7, 10),
      audioSegment("other", 0, 1, 3)
    ];
    expect(getTimelineRangeSelectionForSegments(segments, ["video", "voice"])).toEqual({
      start: 5,
      end: 10,
      laneIds: ["video", "audio:2"]
    });
  });

  it("builds an inclusive ordered lane range in either drag direction", () => {
    const lanes: TimelineLaneId[] = [
      "video",
      "zoom",
      "speed",
      "subtitles",
      "text",
      "audio:0",
      "audio:1"
    ];
    expect(getTimelineLaneIdsBetween(lanes, "speed", "audio:1")).toEqual([
      "speed",
      "subtitles",
      "text",
      "audio:0",
      "audio:1"
    ]);
    expect(getTimelineLaneIdsBetween(lanes, "audio:1", "speed")).toEqual([
      "speed",
      "subtitles",
      "text",
      "audio:0",
      "audio:1"
    ]);
    expect(getTimelineLaneIdsBetween(lanes, "zoom", "zoom")).toEqual(["zoom"]);
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
