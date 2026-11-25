/**
 * B-roll cutaways (S10).
 *
 * An image does not need an overlay layer to appear at the right moment: the
 * video segment is split around that moment and the image takes its place, then
 * the recording resumes. The timeline already renders and exports that, so a
 * cutaway inherits trims, zoom, speed and the export pipeline for free.
 */
import type { TimelineSegment } from "./types";

export interface BrollCutawayRequest {
  /** Import id of the image to show. */
  readonly itemId: string;
  readonly start: number;
  readonly end: number;
}

const EPSILON = 0.001;

function isVideoClip(segment: TimelineSegment): boolean {
  return segment.track === "video" && segment.hidden !== true;
}

function lowestVisibleLane(segments: readonly TimelineSegment[]): number {
  const lanes = segments.filter(isVideoClip).map((segment) => segment.lane);
  return lanes.length > 0 ? Math.min(...lanes) : 0;
}

/**
 * Plans the timeline after inserting the cutaways. Nothing overlapping a
 * cutaway survives inside it: the covering clip is trimmed to the two remaining
 * sides, and the image sits between them.
 */
export function planBrollCutaways(
  segments: readonly TimelineSegment[],
  cutaways: readonly BrollCutawayRequest[]
): TimelineSegment[] {
  const requested = [...cutaways]
    .filter((cutaway) => cutaway.end - cutaway.start >= 0.5)
    .sort((first, second) => first.start - second.start);
  if (requested.length === 0) return [...segments];

  const lane = lowestVisibleLane(segments);
  const result: TimelineSegment[] = [];
  const images: TimelineSegment[] = [];

  for (const segment of segments) {
    if (!isVideoClip(segment) || segment.lane !== lane) {
      result.push(segment);
      continue;
    }

    // Each visible clip is cut into the pieces that the cutaways leave behind.
    let cursor = segment.start;
    const pieces: Array<{ start: number; end: number }> = [];
    for (const cutaway of requested) {
      if (cutaway.end <= cursor || cutaway.start >= segment.end) continue;
      if (cutaway.start > cursor) {
        pieces.push({ start: cursor, end: Math.min(cutaway.start, segment.end) });
      }
      cursor = Math.max(cursor, cutaway.end);
    }
    if (cursor < segment.end) pieces.push({ start: cursor, end: segment.end });

    if (pieces.length === 0) continue;
    pieces.forEach((piece, index) => {
      if (piece.end - piece.start <= EPSILON) return;
      result.push({
        ...segment,
        id: index === 0 ? segment.id : `${segment.id}-broll-${index}`,
        start: piece.start,
        end: piece.end,
        // Trimming the head of a clip shifts where its source starts.
        sourceStart: segment.sourceStart + (piece.start - segment.start)
      });
    });
  }

  requested.forEach((cutaway, index) => {
    images.push({
      id: `broll-${index + 1}-${cutaway.itemId}`,
      itemId: cutaway.itemId,
      track: "video",
      lane,
      start: cutaway.start,
      end: cutaway.end,
      sourceStart: 0
    });
  });

  return [...result, ...images].sort(
    (first, second) => first.start - second.start || first.lane - second.lane
  );
}

/**
 * Spreads the available images over the informative transcript moments, so a
 * folder of pictures becomes a cutaway plan without manual timing.
 */
export function planBrollMomentSlots(
  candidates: readonly { start: number; end: number; text: string }[],
  imageItemIds: readonly string[],
  options: { maxCutaways?: number; minSeconds?: number; maxSeconds?: number } = {}
): BrollCutawayRequest[] {
  const maxCutaways = options.maxCutaways ?? 6;
  const minSeconds = options.minSeconds ?? 2.5;
  const maxSeconds = options.maxSeconds ?? 5;
  if (imageItemIds.length === 0) return [];

  const usable = candidates
    .filter((candidate) => candidate.text.trim().split(/\s+/u).length >= 3)
    .slice(0, maxCutaways);
  return usable.map((candidate, index) => {
    const start = Math.max(0, candidate.start);
    const length = Math.min(maxSeconds, Math.max(minSeconds, candidate.end - candidate.start));
    return {
      itemId: imageItemIds[index % imageItemIds.length],
      start: Math.round(start * 1000) / 1000,
      end: Math.round((start + length) * 1000) / 1000
    };
  });
}
