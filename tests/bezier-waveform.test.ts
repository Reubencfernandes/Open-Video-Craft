import { describe, expect, it } from "vitest";
import { createBezierWaveform, createBezierWaveLine } from "../src/renderer/editor/bezier-waveform";

describe("Bezier timeline waveform", () => {
  it("creates deterministic cubic curves for the same audio clip", () => {
    const first = createBezierWaveform("ambient-audio");
    expect(createBezierWaveform("ambient-audio")).toBe(first);
    expect(first).toContain(" C ");
    expect(first.endsWith(" Z")).toBe(true);
  });

  it("varies the curve by clip seed and exposes a smooth center line", () => {
    expect(createBezierWaveform("clip-a")).not.toBe(createBezierWaveform("clip-b"));
    expect(createBezierWaveLine("clip-a")).toMatch(/^M .+ C /);
  });

  it("scales the Bézier control points with the audio gain", () => {
    const quiet = createBezierWaveform("clip-a", 1000, 36, 0.2);
    const loud = createBezierWaveform("clip-a", 1000, 36, 1);
    expect(quiet).not.toBe(loud);
    expect(createBezierWaveform("clip-a", 1000, 36, 0)).toContain("M 0.0 18.0");

    const flatLine = createBezierWaveLine("clip-a", 1000, 36, 0);
    expect(flatLine).toContain("M 0.0 18.0");
    expect(flatLine).not.toBe(createBezierWaveLine("clip-a", 1000, 36, 1));
  });
});
