import { describe, expect, it } from "vitest";
import { shouldShowSourceSelectionOverlay } from "../src/renderer/recorder/source-overlay-state";
import type { FloatingState } from "../src/renderer/recorder/types";

describe("shouldShowSourceSelectionOverlay", () => {
  it.each(["ready", "preparing", "countdown", "recording", "paused"] as FloatingState[])(
    "keeps the border visible during %s so the user always sees the recorded screen",
    (state) => {
      expect(
        shouldShowSourceSelectionOverlay({
          borderOverlayEnabled: true,
          state,
          selectedSourceKind: "screen"
        })
      ).toBe(true);
    }
  );

  it.each(["stopping", "processing", "complete", "failed"] as FloatingState[])(
    "hides the border once the session is over (%s)",
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
