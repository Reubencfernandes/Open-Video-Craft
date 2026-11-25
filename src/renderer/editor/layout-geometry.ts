/**
 * Geometry for preview layout: camera frame presets and drag/resize math.
 *
 * The preset frames themselves live in the shared editor domain so the exporter
 * arranges the same layers as the canvas.
 */
import type {
  CameraFrame,
  CameraPosition,
  LayoutMode,
  ScreenAspectRatio,
  ScreenLayoutDragMode
} from "./types";
import { getCompositionLayout } from "../../shared/editor-domain/timeline-visibility";
import { clampNumber } from "./utils";

export type PercentFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const compositionFrameAspect = 16 / 9;

export function getScreenResizeDirection(mode: ScreenLayoutDragMode): { x: number; y: number } {
  switch (mode) {
    case "resize-nw":
      return { x: -1, y: -1 };
    case "resize-ne":
      return { x: 1, y: -1 };
    case "resize-sw":
      return { x: -1, y: 1 };
    case "resize-se":
      return { x: 1, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}

export function getScreenFrameForAspectRatio(
  layoutMode: LayoutMode,
  aspectRatio: ScreenAspectRatio,
  intrinsicAspect: number | null = null
): PercentFrame {
  const layout = getCompositionLayout({
    layoutMode,
    screenAspectRatio: aspectRatio,
    screenIntrinsicAspect: intrinsicAspect
  });
  // Camera-only hides the base picture; callers only ask for a screen frame of
  // presets that keep it on screen.
  return layout.base?.frame ?? { x: 0, y: 0, width: 100, height: 100 };
}

export function getCameraFrameFromPreset(
  position: CameraPosition,
  size: number
): CameraFrame {
  const safeSize = clampNumber(size, 12, 64);
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
    x: clampNumber(x, 0, Math.max(0, 100 - safeSize)),
    y: clampNumber(y, 0, Math.max(0, 100 - safeHeight)),
    size: safeSize
  };
}

export function resizeCameraFrameAroundCenter(
  frame: CameraFrame,
  size: number
): CameraFrame {
  const safeSize = clampNumber(size, 12, 64);
  const currentHeight = frame.size * compositionFrameAspect;
  const nextHeight = safeSize * compositionFrameAspect;
  const centerX = frame.x + frame.size / 2;
  const centerY = frame.y + currentHeight / 2;

  return {
    x: clampNumber(centerX - safeSize / 2, 0, Math.max(0, 100 - safeSize)),
    y: clampNumber(centerY - nextHeight / 2, 0, Math.max(0, 100 - nextHeight)),
    size: safeSize
  };
}

export function createCameraFrameFromPixels(
  left: number,
  top: number,
  size: number,
  canvasWidth: number,
  canvasHeight: number
): CameraFrame {
  const safeCanvasWidth = Math.max(1, canvasWidth);
  const safeCanvasHeight = Math.max(1, canvasHeight);
  const minSize = Math.min(safeCanvasWidth, safeCanvasHeight) * 0.12;
  const maxSize = Math.min(safeCanvasWidth, safeCanvasHeight) * 0.86;
  const safeSize = clampNumber(size, minSize, maxSize);
  const safeLeft = clampNumber(left, 0, Math.max(0, safeCanvasWidth - safeSize));
  const safeTop = clampNumber(top, 0, Math.max(0, safeCanvasHeight - safeSize));

  return {
    x: (safeLeft / safeCanvasWidth) * 100,
    y: (safeTop / safeCanvasHeight) * 100,
    size: (safeSize / safeCanvasWidth) * 100
  };
}

