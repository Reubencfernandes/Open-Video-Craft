/**
 * Non-destructive screen crop geometry (S8, S15).
 *
 * The crop is stored as percentages of the recorded frame and never touches the
 * recorded file. Scaling about the crop corner makes the kept region fill the
 * frame exactly, so removing a menu bar or an address bar does not letterbox the
 * picture, and the same numbers drive the ffmpeg crop on export.
 */
import type { ScreenCrop } from "./types";

export const emptyScreenCrop: ScreenCrop = { top: 0, right: 0, bottom: 0, left: 0 };

function inRange(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 60;
}

/**
 * Normalizes a crop. Values outside 0..60 percent are rejected as a whole rather
 * than clamped: a stored crop that cannot be trusted must never silently move
 * the picture.
 */
export function normalizeScreenCrop(crop: ScreenCrop | null | undefined): ScreenCrop {
  if (!crop) return emptyScreenCrop;
  const { top, right, bottom, left } = crop;
  if (!inRange(top) || !inRange(right) || !inRange(bottom) || !inRange(left)) {
    return emptyScreenCrop;
  }
  if (top + bottom >= 90 || left + right >= 90) return emptyScreenCrop;
  return { top, right, bottom, left };
}

export function hasScreenCrop(crop: ScreenCrop | null | undefined): boolean {
  const normalized = normalizeScreenCrop(crop);
  return (
    normalized.top > 0 ||
    normalized.right > 0 ||
    normalized.bottom > 0 ||
    normalized.left > 0
  );
}

/**
 * CSS that turns the kept region into the visible frame. Percentages are
 * normalized 0..1, so the numbers stay valid at any preview size.
 */
export function screenCropTransform(crop: ScreenCrop | null | undefined): {
  readonly transform: string;
  readonly transformOrigin: "0 0";
} | null {
  if (!hasScreenCrop(crop)) return null;
  const normalized = normalizeScreenCrop(crop);
  const width = 1 - (normalized.left + normalized.right) / 100;
  const height = 1 - (normalized.top + normalized.bottom) / 100;
  const scaleX = 1 / width;
  const scaleY = 1 / height;
  const translateX = -(normalized.left / 100) * scaleX * 100;
  const translateY = -(normalized.top / 100) * scaleY * 100;
  return {
    transform: `translate(${translateX.toFixed(3)}%, ${translateY.toFixed(3)}%) scale(${scaleX.toFixed(
      4
    )}, ${scaleY.toFixed(4)})`,
    transformOrigin: "0 0"
  };
}

/** ffmpeg crop filter for the same region, or null when nothing is cropped. */
export function screenCropFilter(crop: ScreenCrop | null | undefined): string | null {
  if (!hasScreenCrop(crop)) return null;
  const normalized = normalizeScreenCrop(crop);
  const width = 10_000 - (normalized.left + normalized.right) * 100;
  const height = 10_000 - (normalized.top + normalized.bottom) * 100;
  return [
    `crop=iw*${width}/10000:ih*${height}/10000`,
    `iw*${Math.round(normalized.left * 100)}/10000`,
    `ih*${Math.round(normalized.top * 100)}/10000`
  ].join(":");
}
