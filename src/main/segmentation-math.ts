/**
 * Mask math for webcam background removal (S9, S12).
 *
 * The segmentation model returns a small saliency map; everything else here is
 * plain arithmetic so it can be tested without the model, the video, or ffmpeg:
 * normalize the map, resize it to the frame, turn it into an alpha channel, and
 * composite it onto the frame's pixels.
 */

/** Min-max normalizes a raw model output into 0..1. */
export function normalizeMask(raw: ArrayLike<number>): Float32Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const result = new Float32Array(raw.length);
  if (!Number.isFinite(span) || span <= 1e-6) {
    // A flat map carries no information; treat it as "keep nothing".
    return result;
  }
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    result[index] = Number.isFinite(value) ? (value - min) / span : 0;
  }
  return result;
}

/** Bilinear resize of a 0..1 mask, so a 320x320 output fits any frame. */
export function resizeMask(
  mask: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Float32Array {
  const result = new Float32Array(targetWidth * targetHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return result;
  }
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const wy = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const wx = sourceX - x0;
      const top = mask[y0 * sourceWidth + x0] * (1 - wx) + mask[y0 * sourceWidth + x1] * wx;
      const bottom = mask[y1 * sourceWidth + x0] * (1 - wx) + mask[y1 * sourceWidth + x1] * wx;
      result[y * targetWidth + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return result;
}

export interface MaskToAlphaOptions {
  /** Everything below this saliency becomes fully transparent. */
  readonly threshold?: number;
  /** Feathering range above the threshold, for softer edges. */
  readonly softness?: number;
}

/**
 * Turns a 0..1 mask into an 8-bit alpha channel. A soft ramp keeps hair and
 * shoulders from looking cut out, which is the whole point of a real model.
 */
export function maskToAlpha(
  mask: Float32Array,
  options: MaskToAlphaOptions = {}
): Uint8ClampedArray {
  const threshold = Math.min(0.95, Math.max(0.05, options.threshold ?? 0.45));
  const softness = Math.max(0.01, options.softness ?? 0.25);
  const alpha = new Uint8ClampedArray(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    const value = (mask[index] - threshold) / softness;
    const clamped = Math.min(1, Math.max(0, value));
    alpha[index] = Math.round(clamped * 255);
  }
  return alpha;
}

/**
 * Applies an alpha channel to interleaved RGBA pixels in place. The frame array
 * must already be RGBA (4 bytes per pixel).
 */
export function applyAlphaToRgba(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray
): Uint8ClampedArray {
  const pixels = Math.min(alpha.length, Math.floor(rgba.length / 4));
  for (let index = 0; index < pixels; index += 1) {
    rgba[index * 4 + 3] = alpha[index];
  }
  return rgba;
}

/** Expands interleaved RGB pixels into RGBA with a fully opaque alpha. */
export function rgbToRgba(rgb: Uint8Array, pixelCount: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    rgba[index * 4] = rgb[index * 3];
    rgba[index * 4 + 1] = rgb[index * 3 + 1];
    rgba[index * 4 + 2] = rgb[index * 3 + 2];
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}
