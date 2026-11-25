import { describe, expect, it } from "vitest";

import { getTimelinePackAnchor, packTimelineSegments } from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

const clip = (id: string, start: number, end: number, track: "video" | "audio" = "video"): TimelineSegment => ({
  id,
  itemId: `item-${id}`,
  track,
  lane: 0,
  start,
  end,
  sourceStart: start
});

describe("closing gaps", () => {
  it("removes dead air before the first clip and between the following ones", () => {
    const packed = packTimelineSegments(
      [clip("a", 5, 10), clip("b", 20, 25), clip("c", 40, 45)],
      ["a", "b", "c"]
    );

    expect(packed.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 5],
      [5, 10],
      [10, 15]
    ]);
    // The source offset is what makes the picture still start at the right frame.
    expect(packed.map((segment) => segment.sourceStart)).toEqual([5, 20, 40]);
  });

  it("leaves clips that were not selected exactly where they were", () => {
    const packed = packTimelineSegments(
      [clip("a", 0, 5), clip("b", 10, 15), clip("mic", 0, 30, "audio")],
      ["b"]
    );

    expect(packed.find((segment) => segment.id === "a")?.start).toBe(0);
    expect(packed.find((segment) => segment.id === "mic")?.end).toBe(30);
    expect(packed.find((segment) => segment.id === "b")?.start).toBe(0);
  });

  it("does nothing when there is no selection", () => {
    const segments = [clip("a", 5, 10)];
    expect(packTimelineSegments(segments, [])).toEqual(segments);
  });

  it("compacts a selection in place instead of dragging it to zero", () => {
    const segments = [clip("a", 0, 5), clip("b", 20, 30), clip("c", 40, 50)];
    const ids = ["b", "c"];
    const packed = packTimelineSegments(
      segments,
      ids,
      getTimelinePackAnchor(segments, ids)
    );

    expect(packed.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 5],
      [20, 30],
      [30, 40]
    ]);
  });

  it("anchors the whole channel at zero so the leading gap disappears", () => {
    const segments = [clip("a", 5, 10), clip("b", 20, 25)];
    const ids = segments.map((segment) => segment.id);

    expect(getTimelinePackAnchor(segments, ids)).toBe(5);
    expect(packTimelineSegments(segments, ids, 0).map((segment) => segment.start)).toEqual([0, 5]);
  });

  it("anchors an empty target list at zero", () => {
    expect(getTimelinePackAnchor([clip("a", 5, 10)], [])).toBe(0);
  });
});
