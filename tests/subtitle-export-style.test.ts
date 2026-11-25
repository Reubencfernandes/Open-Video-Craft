import { describe, expect, it } from "vitest";

import {
  isVerticalResolution,
  subtitleForceStyle
} from "../src/shared/editor-domain/subtitle-export-style";

describe("burned-in subtitle styling", () => {
  it("keeps the plain preset quiet and readable", () => {
    const style = subtitleForceStyle("clean");
    expect(style).toContain("Bold=0");
    expect(style).toContain("Outline=2");
    expect(style).toContain("Alignment=2");
  });

  it("gives the TikTok presets a heavy outline and bright colour", () => {
    expect(subtitleForceStyle("karaoke")).toContain("Outline=4");
    expect(subtitleForceStyle("karaoke")).toContain("PrimaryColour=&H0000E5FF");
    expect(subtitleForceStyle("pop")).toContain("Outline=5");
    expect(subtitleForceStyle("boxed")).toContain("BorderStyle=3");
  });

  it("uses larger type and a higher bottom margin on a vertical frame", () => {
    const horizontal = subtitleForceStyle("clean", false);
    const vertical = subtitleForceStyle("clean", true);
    expect(horizontal).toContain("Fontsize=44");
    expect(vertical).toContain("Fontsize=64");
    expect(vertical).toContain("MarginV=220");
  });

  it("recognizes the reel frame", () => {
    expect(isVerticalResolution(1080, 1920)).toBe(true);
    expect(isVerticalResolution(1920, 1080)).toBe(false);
  });
});
