import { describe, expect, it } from "vitest";

import { swapTimelineVideoChannels } from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

function segment(id: string, lane: number, overrides: Partial<TimelineSegment> = {}): TimelineSegment {
  return {
    id,
    itemId: `${id}:item`,
    track: "video",
    lane,
    start: 0,
    end: 2,
    sourceStart: 0,
    ...overrides
  };
}

describe("video channel order", () => {
  it("swaps every clip in two adjacent channels without changing timing or metadata", () => {
    const segments = [
      segment("cam", 0, { hidden: true, layout: "presenter" }),
      segment("screen", 1, { start: 3, end: 5, sourceStart: 1 }),
      segment("audio", 0, { track: "audio" })
    ];

    const swapped = swapTimelineVideoChannels(segments, 0, 1);

    expect(swapped.map((item) => [item.id, item.lane])).toEqual([
      ["cam", 1],
      ["screen", 0],
      ["audio", 0]
    ]);
    expect(swapped[0]).toMatchObject({ hidden: true, layout: "presenter", start: 0, end: 2 });
    expect(swapped[1]).toMatchObject({ start: 3, end: 5, sourceStart: 1 });
    expect(segments.map((item) => item.lane)).toEqual([0, 1, 0]);
  });

  it("refuses non-adjacent or invalid channels", () => {
    const segments = [segment("a", 0), segment("b", 2)];
    expect(swapTimelineVideoChannels(segments, 0, 2)).toEqual(segments);
    expect(swapTimelineVideoChannels(segments, 0, -1)).toEqual(segments);
  });
});
