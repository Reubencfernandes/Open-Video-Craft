import { describe, expect, it } from "vitest";
import { shouldShowSourceSelectionOverlay } from "../src/renderer/recorder/source-overlay-state";
import type { FloatingState } from "../src/renderer/recorder/types";

describe("shouldShowSourceSelectionOverlay", () => {
  it.each([
    "ready",
    "preparing",
    "countdown",
    "recording",
    "paused",
    "stopping",
    "processing",
    "complete",
    "failed"
  ] as FloatingState[])(
    "never covers the selected display with a separate overlay during %s",
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
