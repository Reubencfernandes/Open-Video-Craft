/**
 * Geometry for preview layout: camera frame presets and drag/resize math.
 */
import {
  getCameraFrameFromPreset,
  getLayoutPresetCameraFrame
} from "../../shared/editor-domain/layout-presets";
import type {
  CameraFrame,
  LayoutMode,
  ScreenAspectRatio,
  ScreenLayoutDragMode
} from "./types";
import { clampNumber } from "./utils";

export { getCameraFrameFromPreset, getLayoutPresetCameraFrame };

export type PercentFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Thumbnail for a layout preset, in percent of a 16:9 frame. Derived from the
 * same geometry the preview renders, so the picker always shows what the
 * preset really does.
 */
export type LayoutPresetDiagram = {
  screen: PercentFrame | null;
  camera: (PercentFrame & { shape: "circle" | "rect" }) | null;
};

const compositionFrameAspect = 16 / 9;

/** Camera placement the diagrams use for bubble presets (bottom-right, M). */
const diagramBubblePosition = "bottom-right";
const diagramBubbleSize = 24;

export function getLayoutPresetDiagram(layoutMode: LayoutMode): LayoutPresetDiagram {
  switch (layoutMode) {
    case "camera-only":
      return { screen: null, camera: { x: 0, y: 0, width: 100, height: 100, shape: "rect" } };
    case "side-by-side":
      return {
        screen: { x: 40, y: 0, width: 60, height: 100 },
        camera: { x: 0, y: 0, width: 40, height: 100, shape: "rect" }
      };
    case "screen-only":
      return { screen: getScreenFrameForAspectRatio(layoutMode, "16:9"), camera: null };
    default: {
      const frame = getLayoutPresetCameraFrame(
        layoutMode,
        diagramBubblePosition,
        diagramBubbleSize
      );
      return {
        screen: getScreenFrameForAspectRatio(layoutMode, "16:9"),
        camera: {
          x: frame.x,
          y: frame.y,
          width: frame.size,
          height: frame.size * compositionFrameAspect,
          shape: "circle"
        }
      };
    }
  }
}

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
  const bounds = getScreenFrameBounds(layoutMode);
  // The filled-screen preset must use the composition bounds themselves.
  // Fitting an aspect-ratio frame inside the regular inset bounds only made
  // object-fit crop the video inside a smaller rectangle, which looked the
  // same as the normal bubble preset.
  if (layoutMode === "bubble-fill") {
    return bounds;
  }
  return fitFrameInBounds(
    bounds,
    getScreenAspectRatioValue(aspectRatio, intrinsicAspect)
  );
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

function getScreenFrameBounds(layoutMode: LayoutMode): PercentFrame {
  switch (layoutMode) {
    case "bubble-fill":
      return { x: 0, y: 0, width: 100, height: 100 };
    case "presenter":
      return { x: 6, y: 15, width: 60, height: 62 };
    case "side-overlap":
      return { x: 36, y: 10, width: 60, height: 76 };
    default:
      return { x: 4, y: 6, width: 92, height: 88 };
  }
}

function getScreenAspectRatioValue(
  aspectRatio: ScreenAspectRatio,
  intrinsicAspect: number | null
): number {
  switch (aspectRatio) {
    // "auto" sizes the frame to the recording itself so the frame (and the
    // selection border drawn on it) hugs the visible picture with no
    // letterbox gap. Falls back to 16:9 until the video metadata is known.
    case "auto":
      return intrinsicAspect && Number.isFinite(intrinsicAspect) && intrinsicAspect > 0
        ? intrinsicAspect
        : 16 / 9;
    case "16:10":
      return 16 / 10;
    case "4:3":
      return 4 / 3;
    case "16:9":
    default:
      return 16 / 9;
  }
}

function fitFrameInBounds(bounds: PercentFrame, aspectRatio: number): PercentFrame {
  const width = Math.min(
    bounds.width,
    (bounds.height * aspectRatio) / compositionFrameAspect
  );
  const height = (width * compositionFrameAspect) / aspectRatio;

  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height
  };
}
