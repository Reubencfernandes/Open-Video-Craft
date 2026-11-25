import { describe, expect, it } from "vitest";

import {
  mergeTouchingRanges,
  reelDuration,
  selectReelHighlights
} from "../src/shared/editor-domain/reel-highlights";

const segment = (id: string, start: number, end: number, text: string) => ({
  id,
  start,
  end,
  text
});

describe("reel highlight selection", () => {
  it("prefers the most substantive spoken moments", () => {
    const highlights = selectReelHighlights([
      segment("a", 0, 8, "And then"),
      segment("b", 10, 20, "This is how the multi source recording captures separate tracks"),
      segment("c", 22, 30, "okay")
    ], { minClipSeconds: 6 });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].start).toBeCloseTo(9.65, 2);
    expect(highlights[0].end).toBeCloseTo(20.35, 2);
  });

  it("stays inside the duration budget", () => {
    const segments = Array.from({ length: 12 }, (_, index) =>
      segment(`s${index}`, index * 15, index * 15 + 10, "An explanation that carries real content here")
    );
    const highlights = selectReelHighlights(segments, { maxDurationSeconds: 30, maxClips: 12 });

    expect(reelDuration(highlights)).toBeLessThanOrEqual(30);
  });

  it("never returns overlapping ranges and keeps them ordered", () => {
    const highlights = selectReelHighlights([
      segment("a", 5, 12, "A long meaningful explanation about the canvas"),
      segment("b", 6, 13, "Another overlapping explanation with useful details"),
      segment("c", 40, 48, "A separate explanation far later in the recording")
    ], { minClipSeconds: 5 });

    expect(highlights).toHaveLength(2);
    expect(highlights[0].end).toBeLessThanOrEqual(highlights[1].start);
  });

  it("drops moments that are too short to be a clip", () => {
    const highlights = selectReelHighlights([
      segment("a", 0, 1, "Short but meaningful words here"),
      segment("b", 30, 40, "A proper explanation that lasts long enough")
    ], { minClipSeconds: 6 });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].start).toBeGreaterThan(25);
  });

  it("merges picks that touch so the reel has no micro-cuts", () => {
    expect(mergeTouchingRanges([{ start: 0, end: 5 }, { start: 5.2, end: 9 }])).toEqual([
      { start: 0, end: 9 }
    ]);
    expect(mergeTouchingRanges([{ start: 0, end: 5 }, { start: 6, end: 9 }])).toHaveLength(2);
  });

  it("returns nothing when there is no speech at all", () => {
    expect(selectReelHighlights([])).toEqual([]);
  });
});
