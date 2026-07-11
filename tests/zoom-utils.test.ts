import { describe, expect, it } from "vitest";
import { applyZoomEasing } from "../src/renderer/editor/zoom-utils";

describe("zoom easing", () => {
  it("keeps linear zoom progress linear", () => {
    expect(applyZoomEasing(0, { easing: "linear" })).toBe(0);
    expect(applyZoomEasing(0.5, { easing: "linear" })).toBeCloseTo(0.5, 3);
    expect(applyZoomEasing(1, { easing: "linear" })).toBe(1);
  });

  it("supports distinct nonlinear presets", () => {
    expect(applyZoomEasing(0.25, { easing: "ease-in" })).toBeLessThan(0.25);
    expect(applyZoomEasing(0.25, { easing: "ease-out" })).toBeGreaterThan(0.25);
  });

  it("uses the saved custom cubic bezier curve", () => {
    const custom = applyZoomEasing(0.25, {
      easing: "custom",
      bezier: [0, 0.8, 0.2, 1]
    });
    expect(custom).toBeGreaterThan(0.7);
  });

  it("gives older saved zooms a smooth default curve", () => {
    expect(applyZoomEasing(0.25, {})).toBeLessThan(0.25);
    expect(applyZoomEasing(0.75, {})).toBeGreaterThan(0.75);
  });
});
