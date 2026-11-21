import { describe, expect, it } from "vitest";

import { analyzeAudioSamples, smoothMeterLevel } from "../src/renderer/recorder/audio-meter";

describe("microphone preview meter", () => {
  it("shows silence for an empty or zero sample window", () => {
    expect(analyzeAudioSamples(new Int16Array(0))).toEqual({ rms: 0, percent: 0, active: false });
    expect(analyzeAudioSamples(new Int16Array([0, 0, 0])).active).toBe(false);
  });

  it("reports increasing levels for louder input", () => {
    const quiet = analyzeAudioSamples(new Int16Array([100, -100, 100, -100]));
    const loud = analyzeAudioSamples(new Int16Array([16_000, -16_000, 16_000, -16_000]));
    expect(loud.rms).toBeGreaterThan(quiet.rms);
    expect(loud.percent).toBeGreaterThan(quiet.percent);
    expect(loud.active).toBe(true);
  });

  it("clamps the display percentage and smooths fast falls", () => {
    expect(smoothMeterLevel(90, 100)).toBeGreaterThan(90);
    expect(smoothMeterLevel(100, 0)).toBeGreaterThan(0);
    expect(smoothMeterLevel(100, 0)).toBeLessThan(100);
  });
});
