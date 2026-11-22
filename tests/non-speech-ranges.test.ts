import { describe, expect, it } from "vitest";
import { deriveNonSpeechRanges } from "../src/shared/analysis/non-speech-ranges";

describe("deriveNonSpeechRanges", () => {
  it("returns transcript gaps instead of energy-detected slices", () => {
    const result = deriveNonSpeechRanges(
      [
        { start: 2, end: 4, text: "hello" },
        { start: 6, end: 8, text: "world" }
      ],
      10,
      [{ start: 1, end: 1.5, duration: 0.5 }, { start: 4.2, end: 5.8, duration: 1.6 }]
    );
    expect(result).toEqual([
      { start: 0, end: 2, duration: 2 },
      { start: 4, end: 6, duration: 2 },
      { start: 8, end: 10, duration: 2 }
    ]);
  });

  it("falls back to energy detections when no transcript exists", () => {
    const energy = [{ start: 1, end: 2.5, duration: 1.5 }];
    expect(deriveNonSpeechRanges([], 10, energy)).toEqual(energy);
  });

  it("ignores gaps shorter than the minimum", () => {
    expect(deriveNonSpeechRanges([
      { start: 0, end: 1, text: "first" },
      { start: 1.1, end: 2, text: "second" }
    ], 2, [], 0.35)).toEqual([]);
  });
});
