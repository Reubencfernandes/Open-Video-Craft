import { describe, expect, it } from "vitest";
import {
  getVideoCornerScale,
  getVideoCornerStyles
} from "../src/renderer/editor/useEditorDerivedData";
import { getScreenFrameForAspectRatio } from "../src/renderer/editor/layout-geometry";

describe("video corner styles", () => {
  it("maps Flat, Slight, and Rounded to progressively rounder corners", () => {
    expect(getVideoCornerStyles("flat")).toEqual({
      borderRadius: 0,
      clipPath: "none"
    });
    expect(getVideoCornerStyles("soft")).toEqual({
      borderRadius: "16px",
      clipPath: "inset(0 round 16px)"
    });
    expect(getVideoCornerStyles("round")).toEqual({
      borderRadius: "32px",
      clipPath: "inset(0 round 32px)"
    });
  });

  it("keeps the filled-screen frame full-size for every corner style", () => {
    for (const style of ["flat", "soft", "round"] as const) {
      expect(getVideoCornerScale("bubble-fill", style)).toBe(1);
      expect(getScreenFrameForAspectRatio("bubble-fill", "4:3")).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });
      expect(getVideoCornerStyles(style)).toBeDefined();
    }
  });
});
