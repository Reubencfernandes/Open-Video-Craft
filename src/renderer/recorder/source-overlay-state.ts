import type { FloatingState } from "./types";

export function shouldShowSourceSelectionOverlay(input: {
  borderOverlayEnabled: boolean;
  state: FloatingState;
  selectedSourceKind: "screen" | "window" | null;
}): boolean {
  return (
    input.borderOverlayEnabled &&
    input.state === "ready" &&
    input.selectedSourceKind === "screen"
  );
}
