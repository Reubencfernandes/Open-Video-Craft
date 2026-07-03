import { describe, expect, it } from "vitest";
import {
  constrainZoomEnd,
  constrainZoomMove,
  constrainZoomStart,
  placeZoomInFirstGap,
  zoomRangesOverlap
} from "../src/renderer/zoom-timing";

const existing = [
  { id: "zoom-1", start: 1, end: 3 },
  { id: "zoom-2", start: 5, end: 7 }
];

describe("zoom timing", () => {
  it("places a new zoom in the first available gap at or after the playhead", () => {
    expect(placeZoomInFirstGap(existing, 2, 1, 10)).toEqual({ start: 3, end: 4 });
  });

  it("prevents a moved zoom from crossing neighboring zooms", () => {
    expect(constrainZoomMove(existing, "zoom-2", 2, 10)).toEqual({ start: 3, end: 5 });
  });

  it("clamps start trim at the previous zoom boundary", () => {
    expect(constrainZoomStart(existing, "zoom-2", 2.5)).toEqual({ start: 3 });
  });

  it("clamps end trim at the next zoom boundary", () => {
    expect(constrainZoomEnd(existing, "zoom-1", 6, 10)).toEqual({ end: 5 });
  });

  it("allows touching zooms but treats real overlaps as overlap", () => {
    expect(zoomRangesOverlap({ start: 1, end: 3 }, { start: 3, end: 4 })).toBe(false);
    expect(zoomRangesOverlap({ start: 1, end: 3 }, { start: 2.99, end: 4 })).toBe(false);
    expect(zoomRangesOverlap({ start: 1, end: 3 }, { start: 2.5, end: 4 })).toBe(true);
  });
});
