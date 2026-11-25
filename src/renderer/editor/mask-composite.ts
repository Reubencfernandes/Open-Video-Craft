/**
 * Composite math for the masked webcam preview (S9).
 *
 * The mask arrives as a grayscale video, so its red channel becomes the alpha of
 * the camera frame. Kept pure so the compositor's behaviour is testable without a
 * canvas, a video, or a browser.
 */

/** Writes the mask luminance into the alpha channel of an RGBA frame. */
export function maskAlphaIntoFrame(
  frame: Uint8ClampedArray,
  mask: Uint8ClampedArray
): Uint8ClampedArray {
  const pixels = Math.min(Math.floor(frame.length / 4), Math.floor(mask.length / 4));
  for (let index = 0; index < pixels; index += 1) {
    frame[index * 4 + 3] = mask[index * 4];
  }
  return frame;
}

/** True when the mask and the frame describe the same picture size. */
export function samePixelCount(frame: Uint8ClampedArray, mask: Uint8ClampedArray): boolean {
  return Math.floor(frame.length / 4) === Math.floor(mask.length / 4);
}
