import { describe, expect, it } from "vitest";
import { getScreenFrameForAspectRatio } from "../src/renderer/editor/layout-geometry";

describe("preview layout geometry", () => {
  it("fills the whole composition for the bubble-fill preset", () => {
    expect(getScreenFrameForAspectRatio("bubble-fill", "4:3")).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100
    });
  });

  it("keeps the normal bubble preset inset and aspect-fitted", () => {
    const frame = getScreenFrameForAspectRatio("bubble", "16:9");
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.y).toBeGreaterThan(0);
    expect(frame.width).toBeLessThan(100);
    expect(frame.height).toBeLessThan(100);
  });
});
