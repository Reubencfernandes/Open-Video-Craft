import { describe, expect, it } from "vitest";
import {
  getVideoCornerScale,
  getVideoCornerStyles
} from "../src/renderer/editor/useEditorDerivedData";

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

  it("reveals the selected background around a rounded filled screen", () => {
    expect(getVideoCornerScale("bubble-fill", "soft")).toBe(0.97);
    expect(getVideoCornerScale("bubble-fill", "round")).toBe(0.94);
    expect(getVideoCornerScale("bubble-fill", "flat")).toBe(1);
    expect(getVideoCornerScale("bubble", "soft")).toBe(1);
  });
});
