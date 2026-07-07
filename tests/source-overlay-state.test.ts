import { describe, expect, it } from "vitest";
import { shouldShowSourceSelectionOverlay } from "../src/renderer/recorder/source-overlay-state";
import type { FloatingState } from "../src/renderer/recorder/types";

describe("shouldShowSourceSelectionOverlay", () => {
  it("shows the border only before screen recording starts", () => {
    expect(
      shouldShowSourceSelectionOverlay({
        borderOverlayEnabled: true,
        state: "ready",
        selectedSourceKind: "screen"
      })
    ).toBe(true);
  });

  it.each(["preparing", "countdown", "recording", "paused", "stopping"] as FloatingState[])(
    "hides the border during %s so it cannot cover the capture",
    (state) => {
      expect(
        shouldShowSourceSelectionOverlay({
          borderOverlayEnabled: true,
          state,
          selectedSourceKind: "screen"
        })
      ).toBe(false);
    }
  );

  it("does not show for window sources or disabled overlays", () => {
    expect(
      shouldShowSourceSelectionOverlay({
        borderOverlayEnabled: true,
        state: "ready",
        selectedSourceKind: "window"
      })
    ).toBe(false);
    expect(
      shouldShowSourceSelectionOverlay({
        borderOverlayEnabled: false,
        state: "ready",
        selectedSourceKind: "screen"
      })
    ).toBe(false);
  });
});
