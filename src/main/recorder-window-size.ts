/**
 * Expanded recorder window sizing. The selector needs enough room for the
 * display/window grid, the webcam cards and the audio controls without forcing
 * vertical scrolling on a normal desktop.
 */
export type WorkAreaSize = { width: number; height: number };

const maximumExpandedSize = { width: 1000, height: 1040 };
const minimumExpandedSize = { width: 460, height: 460 };
const workAreaMargin = 48;

export function getExpandedRecorderWindowSize(workArea: WorkAreaSize): {
  width: number;
  height: number;
} {
  const clamp = (maximum: number, minimum: number, available: number): number =>
    Math.min(maximum, Math.max(minimum, available - workAreaMargin));

  return {
    width: clamp(maximumExpandedSize.width, minimumExpandedSize.width, workArea.width),
    height: clamp(maximumExpandedSize.height, minimumExpandedSize.height, workArea.height)
  };
}
