import { describe, expect, it } from "vitest";
import {
  createSubtitleActivityRangesFromSilence,
  detectSubtitleActivityRanges
} from "../src/shared/subtitle-activity";

describe("subtitle activity placeholders", () => {
  it("places cloud placeholders only between detected silence ranges", () => {
    expect(createSubtitleActivityRangesFromSilence(12, [
      { start: 2, end: 4 },
      { start: 7, end: 9 }
    ])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 7 },
      { start: 9, end: 12 }
    ]);
  });

  it("detects separated local audio activity without filling silent gaps", () => {
    const sampleRate = 1_000;
    const samples = new Float32Array(6 * sampleRate);
    for (let index = 1 * sampleRate; index < 2 * sampleRate; index += 1) samples[index] = 0.2;
    for (let index = 4 * sampleRate; index < 5 * sampleRate; index += 1) samples[index] = 0.18;

    const ranges = detectSubtitleActivityRanges(samples, sampleRate);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeLessThanOrEqual(1);
    expect(ranges[0].end).toBeGreaterThanOrEqual(2);
    expect(ranges[1].start).toBeLessThanOrEqual(4);
    expect(ranges[1].end).toBeGreaterThanOrEqual(5);
  });

  it("does not create placeholders for effectively silent audio", () => {
    expect(detectSubtitleActivityRanges(new Float32Array(16_000))).toEqual([]);
  });
});
