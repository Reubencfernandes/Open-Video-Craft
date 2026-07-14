import { describe, expect, it } from "vitest";
import { snapRectangleToViewportGrid } from "../src/renderer/editor/layout-snapping";

describe("viewport layout snapping", () => {
  it("snaps rectangle edges to the 12 by 8 composition grid", () => {
    const result = snapRectangleToViewportGrid({
      left: 94,
      top: 96,
      width: 240,
      height: 160,
      canvasWidth: 1_200,
      canvasHeight: 800
    });

    expect(result.left).toBe(100);
    expect(result.top).toBe(100);
    expect(result.guides.vertical[0]).toBeCloseTo(100 / 12);
    expect(result.guides.horizontal).toEqual([12.5]);
  });

  it("snaps an element center as well as its outer edges", () => {
    const result = snapRectangleToViewportGrid({
      left: 545,
      top: 345,
      width: 100,
      height: 100,
      canvasWidth: 1_200,
      canvasHeight: 800
    });

    expect(result.left).toBe(550);
    expect(result.top).toBe(350);
    expect(result.guides.vertical).toEqual([50]);
    expect(result.guides.horizontal).toEqual([50]);
  });

  it("leaves freely positioned elements unchanged outside the snap tolerance", () => {
    const result = snapRectangleToViewportGrid({
      left: 62,
      top: 37,
      width: 120,
      height: 40,
      canvasWidth: 1_200,
      canvasHeight: 800
    });

    expect(result).toEqual({
      left: 62,
      top: 37,
      guides: { vertical: [], horizontal: [] }
    });
  });
});
