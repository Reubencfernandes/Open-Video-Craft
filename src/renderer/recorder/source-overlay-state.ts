/**
 * Pure rule for when the screen-border overlay should be visible.
 */
// A display-sized transparent BrowserWindow can become opaque on some macOS
// and Windows compositor configurations. The recorder therefore identifies
// the selected source inside its controller and never places an overlay over
// the user's display.
export function shouldShowSourceSelectionOverlay(input: {
  borderOverlayEnabled: boolean;
  state: import("./types").FloatingState;
  selectedSourceKind: "screen" | "window" | null;
}): boolean {
  void input;
  return false;
}
