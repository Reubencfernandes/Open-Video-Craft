/**
 * Camera placement implied by each layout preset. Shared by the editor UI and
 * AI/MCP edits so choosing a preset produces the same look everywhere.
 */
import type { CameraFrame, CameraPosition, LayoutMode } from "./types";

/** The composition is always 16:9, so a square camera is taller in percent. */
const compositionFrameAspect = 16 / 9;

/** Split-left overlap: a large camera on the left that overlaps the screen. */
const sideOverlapCameraSize = 34;
/** TV presenter: a large camera beside the screen, on the right. */
const presenterCameraSize = 30;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/** Square camera frame for a 3×3 grid position, inset from the frame edges. */
export function getCameraFrameFromPreset(
  position: CameraPosition,
  size: number
): CameraFrame {
  const safeSize = clamp(size, 12, 64);
  const safeHeight = safeSize * compositionFrameAspect;
  const x = position.endsWith("left")
    ? 6
    : position.endsWith("center")
      ? 50 - safeSize / 2
      : 94 - safeSize;
  const y = position.startsWith("top")
    ? 7
    : position.startsWith("middle")
      ? 50 - safeHeight / 2
      : 93 - safeHeight;

  return {
    x: clamp(x, 0, Math.max(0, 100 - safeSize)),
    y: clamp(y, 0, Math.max(0, 100 - safeHeight)),
    size: safeSize
  };
}

/**
 * Where a preset puts the camera. Bubble layouts use the chosen grid position
 * and size; overlap and presenter layouts have a fixed, larger camera.
 * Camera-only and side-by-side ignore the frame and use fixed placement.
 */
export function getLayoutPresetCameraFrame(
  layoutMode: LayoutMode,
  position: CameraPosition,
  size: number
): CameraFrame {
  switch (layoutMode) {
    case "side-overlap":
      return centeredVertically(8, sideOverlapCameraSize);
    case "presenter":
      return centeredVertically(67, presenterCameraSize);
    default:
      return getCameraFrameFromPreset(position, size);
  }
}

function centeredVertically(x: number, size: number): CameraFrame {
  return { x, y: 50 - (size * compositionFrameAspect) / 2, size };
}
