import { describe, expect, it } from "vitest";
import {
  getDisplayOverlayStripBounds,
  resolveDisplayForOverlay,
  type DisplayForOverlay
} from "../src/main/display-overlay";

const primaryDisplay: DisplayForOverlay = {
  id: 100,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1
};

const secondaryDisplay: DisplayForOverlay = {
  id: 200,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  scaleFactor: 1.5
};

describe("display overlay geometry", () => {
  it("uses desktopCapturer's matching display id when it is available", () => {
    expect(
      resolveDisplayForOverlay(
        { id: "screen:0:0", displayId: "200" },
        [primaryDisplay, secondaryDisplay],
        primaryDisplay
      )
    ).toBe(secondaryDisplay);
  });

  it("uses the sequential screen source number as an index, never as a display id", () => {
    expect(
      resolveDisplayForOverlay(
        { id: "screen:1:0", displayId: "" },
        [primaryDisplay, secondaryDisplay],
        primaryDisplay
      )
    ).toBe(secondaryDisplay);
  });

  it("does not draw an overlay on the wrong display when a source can no longer be matched", () => {
    expect(
      resolveDisplayForOverlay(
        { id: "screen:8:0", displayId: "" },
        [primaryDisplay, secondaryDisplay],
        primaryDisplay
      )
    ).toBeNull();
  });

  it("uses the exact display bounds and a DPI-aware Windows border", () => {
    expect(getDisplayOverlayStripBounds(secondaryDisplay, "win32")).toEqual([
      { x: 1920, y: 0, width: 2560, height: 3 },
      { x: 1920, y: 1437, width: 2560, height: 3 },
      { x: 1920, y: 3, width: 3, height: 1434 },
      { x: 4477, y: 3, width: 3, height: 1434 }
    ]);
  });

  it("preserves the existing six-DIP border on macOS", () => {
    expect(getDisplayOverlayStripBounds(primaryDisplay, "darwin")[0]).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 6
    });
  });
});
