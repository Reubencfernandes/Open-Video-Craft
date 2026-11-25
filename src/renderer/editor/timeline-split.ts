/**
 * Pure split geometry. Keeping this outside the React hook makes the source
 * offsets easy to verify and prevents UI state from changing the edit math.
 */
import { splitLinkedRecordingAudioAt } from "./timeline-links";
import { findSplittableTimelineSegment, timelineSplitEpsilonSeconds } from "./timeline-utils";
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

  // The requested time is used as-is; the epsilon only keeps a blade from
  // landing on a clip edge and producing a zero-length clip.
  const splitTime = clampNumber(
    time,
    source.start + timelineSplitEpsilonSeconds,
    source.end - timelineSplitEpsilonSeconds
  );
  const elapsedSourceTime = splitTime - source.start;
  const resolvedSource = { ...source, ...(source.pendingDuration ? { pendingDuration: false } : {}) };
  const left: TimelineSegment = { ...resolvedSource, end: splitTime };
  const right: TimelineSegment = {
    ...resolvedSource,
    id: createSegmentId(source.id),
    start: splitTime,
    // The right clip continues from the exact source frame after the left one.
    sourceStart: source.sourceStart + elapsedSourceTime
  };

  // Blading a recording's picture also cuts the voice underneath it, so the
  // two halves can be deleted or moved without the audio drifting.
  const withLinkedAudio = splitLinkedRecordingAudioAt(segments, source, splitTime, createSegmentId);

  return {
    left,
    right,
    splitTime,
    segments: withLinkedAudio.flatMap((segment) =>
      segment.id === source.id ? [left, right] : [segment]
    )
  };
}
