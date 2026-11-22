import { describe, expect, it } from "vitest";
import { resampleMonoTo16k } from "../src/renderer/editor/audio-resample";

describe("resampleMonoTo16k", () => {
  it("resamples a stereo-independent mono channel to 16 kHz", () => {
    const values = new Float32Array([0, 0.5, 1, 0.5]);
    const output = resampleMonoTo16k({ sampleRate: 8_000, length: values.length, getChannelData: () => values });
    expect(output.length).toBe(8);
    expect(output[0]).toBe(0);
    expect(output[2]).toBeCloseTo(0.5, 5);
  });

  it("returns an empty buffer for empty audio", () => {
    expect(resampleMonoTo16k({ sampleRate: 48_000, length: 0, getChannelData: () => new Float32Array(0) }).length).toBe(0);
  });
});
