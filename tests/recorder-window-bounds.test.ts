import { describe, expect, it } from "vitest";

import {
  clampRecorderWindowBounds,
  parseRecorderWindowBounds,
  resolveRecorderWindowBounds
} from "../src/main/recorder-window-bounds";

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe("recorder window bounds", () => {
  it("parses only valid integer bounds", () => {
    expect(parseRecorderWindowBounds({ x: 10, y: 20, width: 800, height: 900 })).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 900
    });
    expect(parseRecorderWindowBounds({ x: 0, y: 0, width: 100, height: 900 })).toBeNull();
    expect(parseRecorderWindowBounds({ x: "10", y: 0, width: 800, height: 900 })).toBeNull();
  });

  it("clamps saved bounds into the current work area", () => {
    expect(clampRecorderWindowBounds({ x: -100, y: -50, width: 2000, height: 2000 }, workArea)).toEqual({
      x: 0,
      y: 0,
      width: 1872,
      height: 1032
    });
  });

  it("centers the default expanded size when nothing was saved", () => {
    expect(resolveRecorderWindowBounds(null, workArea)).toEqual({
      x: 460,
      y: 24,
      width: 1000,
      height: 1032
    });
  });
});
