import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTextOverlayFontArgument,
  resolveFontsDirectory,
  resolveOverlayFontFile
} from "../src/main/overlay-fonts";

describe("text overlay fonts", () => {
  it("ships every weight the editor offers", () => {
    const directory = resolveFontsDirectory();
    expect(directory).not.toBeNull();

    for (const weight of [400, 600, 700, 800] as const) {
      const file = resolveOverlayFontFile(weight);
      expect(file, `weight ${weight} has no bundled font`).not.toBeNull();
      expect(existsSync(file!)).toBe(true);
    }
  });

  it("gives each weight its own file, since drawtext cannot synthesize bold", () => {
    const files = ([400, 600, 700, 800] as const).map((weight) =>
      path.basename(resolveOverlayFontFile(weight) ?? "")
    );

    expect(new Set(files).size).toBe(files.length);
  });

  it("pins the sans family to a bundled file", () => {
    const argument = createTextOverlayFontArgument({ fontFamily: "sans", weight: 700 });

    expect(argument).toMatch(/^fontfile='/);
    expect(argument).toContain("Inter-Bold.ttf");
  });

  it("defaults to sans when the overlay predates typography controls", () => {
    expect(createTextOverlayFontArgument({ weight: 400 })).toContain("Inter-Regular.ttf");
  });

  it("falls back to a fontconfig name for families that are not bundled", () => {
    expect(createTextOverlayFontArgument({ fontFamily: "serif", weight: 700 })).toBe("font='serif'");
    expect(createTextOverlayFontArgument({ fontFamily: "mono", weight: 400 })).toBe("font='monospace'");
    expect(createTextOverlayFontArgument({ fontFamily: "rounded", weight: 400 }))
      .toBe("font='Trebuchet MS'");
  });
});
