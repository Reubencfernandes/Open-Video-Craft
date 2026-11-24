/**
 * Timeline filmstrip geometry. Frames are captured once per video at known
 * source times; each clip then lays out fixed-width tiles and shows, in every
 * tile, the frame nearest to the source time that tile covers. Trimmed and
 * split clips therefore show their own footage, and zooming the timeline adds
 * tiles instead of stretching a few small thumbnails.
 */

export type FilmstripFrame = { time: number; src: string };

export type FilmstripTile = { key: number; src: string; widthPx: number | null };

/** Aim for one captured frame per this many seconds of video. */
export const filmstripFrameSpacingSeconds = 2;
export const filmstripMinFrames = 10;
export const filmstripMaxFrames = 48;
/** Upper bound on tiles per clip, so extreme zoom stays cheap to render. */
export const filmstripMaxTiles = 240;
/** Tiles shown before a clip's width is known. */
const unmeasuredTileCount = 10;

/** Sample times centred in equal slots across the video. */
export function getFilmstripSampleTimes(
  duration: number,
  spacingSeconds = filmstripFrameSpacingSeconds,
  minFrames = filmstripMinFrames,
  maxFrames = filmstripMaxFrames
): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }
  const count = Math.max(minFrames, Math.min(maxFrames, Math.ceil(duration / spacingSeconds)));
  const slot = duration / count;
  return Array.from({ length: count }, (_, index) => (index + 0.5) * slot);
}

/**
 * Capture order that spans the whole video early (every 8th sample, then every
 * 4th, …) so a partially captured strip already looks complete.
 */
export function getProgressiveCaptureOrder(count: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  for (const stride of [8, 4, 2, 1]) {
    for (let index = 0; index < count; index += stride) {
      if (!seen.has(index)) {
        seen.add(index);
        order.push(index);
      }
    }
  }
  return order;
}

/** Frame whose source time is closest to `time`. `frames` is time-sorted. */
export function findNearestFilmstripFrame(
  frames: readonly FilmstripFrame[],
  time: number
): FilmstripFrame | null {
  if (frames.length === 0) return null;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (frames[middle].time < time) low = middle + 1;
    else high = middle;
  }
  const after = frames[low];
  const before = frames[Math.max(0, low - 1)];
  return Math.abs(before.time - time) <= Math.abs(after.time - time) ? before : after;
}

/**
 * Tiles for one clip. Each tile shows the footage at the middle of the source
 * range it covers. Without a measured width, a fixed number of flexible tiles
 * is spread over the clip instead.
 */
export function getFilmstripTiles(input: {
  frames: readonly FilmstripFrame[];
  sourceStart: number;
  sourceDuration: number;
  widthPx: number;
  tileWidthPx: number;
}): FilmstripTile[] {
  if (input.frames.length === 0) return [];
  const measured = input.widthPx > 0 && input.tileWidthPx > 0;
  const count = measured
    ? Math.min(filmstripMaxTiles, Math.max(1, Math.ceil(input.widthPx / input.tileWidthPx)))
    : Math.min(unmeasuredTileCount, input.frames.length);
  const tileWidthPx = measured
    ? Math.max(input.tileWidthPx, input.widthPx / filmstripMaxTiles)
    : null;
  const coveredWidth = measured ? count * (tileWidthPx ?? 0) : count;
  const span = Math.max(0, input.sourceDuration);

  return Array.from({ length: count }, (_, index) => {
    const tileCentre = measured
      ? ((index + 0.5) * (tileWidthPx ?? 0)) / Math.max(input.widthPx, 1)
      : (index + 0.5) / coveredWidth;
    const time = input.sourceStart + Math.min(1, tileCentre) * span;
    return {
      key: index,
      src: findNearestFilmstripFrame(input.frames, time)?.src ?? input.frames[0].src,
      widthPx: tileWidthPx
    };
  });
}
