import { describe, expect, it } from "vitest";

import {
  applyAlphaToRgba,
  maskToAlpha,
  normalizeMask,
  resizeMask,
  rgbToRgba
} from "../src/main/segmentation-math";

describe("segmentation mask math", () => {
  it("normalizes a raw saliency map into 0..1", () => {
    expect([...normalizeMask([2, 4, 6, 8])]).toEqual([0, 0.3333333432674408, 0.6666666865348816, 1]);
  });

  it("treats a flat map as no subject instead of inventing one", () => {
    expect([...normalizeMask([5, 5, 5, 5])]).toEqual([0, 0, 0, 0]);
  });

  it("scales a small mask up to the frame size", () => {
    const resized = resizeMask(new Float32Array([0, 0, 1, 1]), 2, 2, 4, 4);
    expect(resized).toHaveLength(16);
    expect(resized[0]).toBeCloseTo(0, 5);
    expect(resized[15]).toBeCloseTo(1, 5);
  });

  it("turns saliency into a soft alpha channel", () => {
    const alpha = maskToAlpha(new Float32Array([0, 0.45, 0.6, 1]), { threshold: 0.45, softness: 0.25 });
    expect(alpha[0]).toBe(0);
    expect(alpha[1]).toBe(0);
    // (0.6 - 0.45) / 0.25 = 0.6 of the ramp.
    expect(alpha[2]).toBe(153);
    expect(alpha[3]).toBe(255);
  });

  it("writes the alpha channel of an RGBA frame without touching its colours", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const result = applyAlphaToRgba(rgba, new Uint8ClampedArray([0, 128]));
    expect([...result]).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
  });

  it("expands an RGB frame to RGBA with full opacity", () => {
    const rgba = rgbToRgba(new Uint8Array([1, 2, 3, 4, 5, 6]), 2);
    expect([...rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });
});
