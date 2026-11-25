/**
 * Highlight selection for short vertical reels (S3, S7).
 *
 * A reel is a new project built from the best moments of a recording, so the
 * picker must be deterministic and independent from ffmpeg: it only turns
 * timestamped speech into ordered, non-overlapping ranges and a total duration
 * that stays inside the requested budget.
 */
import type { SubtitleSegment } from "./types";

export interface ReelHighlight {
  readonly start: number;
  readonly end: number;
}

export interface ReelHighlightOptions {
  /** Total reel length budget in seconds. */
  readonly maxDurationSeconds?: number;
  /** A single moment shorter than this is not worth a cut. */
  readonly minClipSeconds?: number;
  /** Hard cap on the number of moments. */
  readonly maxClips?: number;
  /** Extra time kept before and after a spoken moment. */
  readonly paddingSeconds?: number;
}

export const defaultReelOptions: Required<ReelHighlightOptions> = {
  maxDurationSeconds: 90,
  minClipSeconds: 6,
  maxClips: 8,
  paddingSeconds: 0.35
};

const WEAK_OPENER = /^(um|uh|so|and|but|then|okay|ok|yeah|right)\b/iu;

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => word.length > 0).length;
}

function rounds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Picks the moments worth a reel: the most substantive speech first, then
 * ordered on the timeline and merged when two picks touch, until the duration
 * budget is spent.
 */
export function selectReelHighlights(
  segments: readonly SubtitleSegment[],
  options: ReelHighlightOptions = {}
): ReelHighlight[] {
  const settings = { ...defaultReelOptions, ...options };
  const candidates = segments
    .filter((segment) => segment.end > segment.start)
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      score: wordCount(segment.text) + (WEAK_OPENER.test(segment.text.trim()) ? -6 : 0)
    }))
    // A moment must carry real content: filler that merely starts weakly and
    // says little never earns a cut, no matter how much budget is left.
    .filter((candidate) => candidate.score > 0 && candidate.end - candidate.start >= 0.8)
    .sort((first, second) => second.score - first.score || first.start - second.start);

  const picked: ReelHighlight[] = [];
  let total = 0;
  for (const candidate of candidates) {
    if (picked.length >= settings.maxClips) break;
    const start = Math.max(0, candidate.start - settings.paddingSeconds);
    const end = candidate.end + settings.paddingSeconds;
    const length = end - start;
    if (length < settings.minClipSeconds) continue;
    if (picked.some((range) => start < range.end && end > range.start)) continue;
    if (total + length > settings.maxDurationSeconds) continue;
    picked.push({ start: rounds(start), end: rounds(end) });
    total += length;
  }

  return mergeTouchingRanges(picked.sort((first, second) => first.start - second.start));
}

/** Adjacent picks become one clip so the reel has no artificial micro-cuts. */
export function mergeTouchingRanges(ranges: readonly ReelHighlight[]): ReelHighlight[] {
  const merged: ReelHighlight[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start - previous.end <= 0.5) {
      merged[merged.length - 1] = { start: previous.start, end: Math.max(previous.end, range.end) };
      continue;
    }
    merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/** Timeline length once the picked ranges are placed back to back. */
export function reelDuration(ranges: readonly ReelHighlight[]): number {
  return rounds(ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0));
}
