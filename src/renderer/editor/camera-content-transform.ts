/**
 * CSS transform for the camera feed inside its frame (pan/zoom/mirror).
 */
import type { CameraContentTransform } from "./types";
import { clampNumber } from "./utils";

export function getCameraContentPanLimit(scalePercent: number): number {
  const scale = Math.max(1, scalePercent / 100);
  return ((scale - 1) / (2 * scale)) * 100;
}

export function clampCameraContentTransform(
  transform: CameraContentTransform
): CameraContentTransform {
  const scale = clampNumber(transform.scale, 100, 220);
  const panLimit = getCameraContentPanLimit(scale);
  return {
    ...transform,
    scale,
    x: clampNumber(transform.x, -panLimit, panLimit),
    y: clampNumber(transform.y, -panLimit, panLimit)
  };
}
