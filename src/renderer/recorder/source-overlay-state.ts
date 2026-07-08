import type { FloatingState } from "./types";

const statesWithVisibleBorder: ReadonlySet<FloatingState> = new Set([
  "ready",
  "preparing",
  "countdown",
  "recording",
  "paused"
]);

// The border overlay stays up while recording so the user always sees which
// screen is captured. The overlay windows are opaque and content-protected in
// the main process, so they never appear in the recorded video.
export function shouldShowSourceSelectionOverlay(input: {
  borderOverlayEnabled: boolean;
  state: FloatingState;
  selectedSourceKind: "screen" | "window" | null;
}): boolean {
  return (
    input.borderOverlayEnabled &&
    input.selectedSourceKind === "screen" &&
    statesWithVisibleBorder.has(input.state)
  );
}
