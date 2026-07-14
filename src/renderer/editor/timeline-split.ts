/**
 * Pure split geometry. Keeping this outside the React hook makes the source
 * offsets easy to verify and prevents UI state from changing the edit math.
 */
import { findSplittableTimelineSegment } from "./timeline-utils";
import type { TimelineSegment } from "./types";
import { clampNumber } from "./utils";

export type TimelineSplitResult = {
  segments: TimelineSegment[];
  left: TimelineSegment;
  right: TimelineSegment;
  splitTime: number;
};

export function splitTimelineSegments(
  segments: TimelineSegment[],
  selectedSegmentId: string | null,
  time: number,
  createSegmentId: (sourceId: string) => string = (sourceId) =>
    `${sourceId}-split-${Date.now()}`
): TimelineSplitResult | null {
  const source = findSplittableTimelineSegment(segments, selectedSegmentId, time);
  if (!source) {
    return null;
  }

  const splitTime = clampNumber(time, source.start + 0.1, source.end - 0.1);
  const elapsedSourceTime = splitTime - source.start;
  const left: TimelineSegment = { ...source, end: splitTime };
  const right: TimelineSegment = {
    ...source,
    id: createSegmentId(source.id),
    start: splitTime,
    // The right clip continues from the exact source frame after the left one.
    sourceStart: source.sourceStart + elapsedSourceTime
  };

  return {
    left,
    right,
    splitTime,
    segments: segments.flatMap((segment) =>
      segment.id === source.id ? [left, right] : [segment]
    )
  };
}
