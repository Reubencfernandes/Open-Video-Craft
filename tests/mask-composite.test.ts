import { describe, expect, it } from "vitest";

import { maskAlphaIntoFrame, samePixelCount } from "../src/renderer/editor/mask-composite";

describe("masked camera composition", () => {
  it("takes the mask luminance as the frame alpha", () => {
    const frame = new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 255]);
    const mask = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);

    const result = maskAlphaIntoFrame(frame, mask);

    expect([...result]).toEqual([200, 100, 50, 0, 10, 20, 30, 255]);
  });

  it("leaves colours untouched", () => {
    const frame = new Uint8ClampedArray([1, 2, 3, 255]);
    maskAlphaIntoFrame(frame, new Uint8ClampedArray([9, 9, 9, 9]));
    expect([...frame]).toEqual([1, 2, 3, 9]);
  });

  it("detects a size mismatch so a stale mask never paints garbage", () => {
    expect(samePixelCount(new Uint8ClampedArray(8), new Uint8ClampedArray(8))).toBe(true);
    expect(samePixelCount(new Uint8ClampedArray(8), new Uint8ClampedArray(12))).toBe(false);
  });
});
