import { describe, expect, it } from "vitest";
import {
  hexToHsb,
  hsbToHex
} from "../src/renderer/editor/panels/TextColorPicker";

describe("text color picker conversions", () => {
  it("round-trips representative brand and neutral colors", () => {
    for (const color of ["#ff4b73", "#ffffff", "#111114", "#38bdf8"]) {
      expect(hsbToHex(hexToHsb(color))).toBe(color);
    }
  });

  it("clamps HSB channels before producing a hex color", () => {
    expect(hsbToHex({ hue: 0, saturation: 200, brightness: 200 })).toBe("#ff0000");
    expect(hsbToHex({ hue: 120, saturation: -20, brightness: 50 })).toBe("#808080");
  });
});
