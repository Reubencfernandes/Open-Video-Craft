/** Timestamp ranges derived from local speech transcript gaps. */
export interface NonSpeechRange {
  start: number;
  end: number;
  duration: number;
}

interface SpeechSegment {
  start: number;
  end: number;
}

function range(start: number, end: number): NonSpeechRange {
  const clippedStart = Math.max(0, start);
  const clippedEnd = Math.max(clippedStart, end);
  return { start: clippedStart, end: clippedEnd, duration: clippedEnd - clippedStart };
}

/**
 * Wind and room noise defeat energy-based silence detection. When Whisper has
 * produced speech timestamps, the honest non-speech intervals are the gaps
 * between those timestamps. Energy detections are only a fallback.
 */
export function deriveNonSpeechRanges(
  segments: readonly SpeechSegment[],
  duration: number,
  energyRanges: readonly NonSpeechRange[] = [],
  minimumGapSeconds = 0.35
): NonSpeechRange[] {
  const speech = segments
    .filter((segment) => segment.end > segment.start)
    .map((segment) => ({
      start: Math.max(0, Math.min(duration, segment.start)),
      end: Math.max(0, Math.min(duration, segment.end))
    }))
    .sort((left, right) => left.start - right.start);
  if (speech.length === 0) return [...energyRanges];

  const gaps: NonSpeechRange[] = [];
  let cursor = 0;
  for (const segment of speech) {
    if (segment.start - cursor >= minimumGapSeconds) {
      gaps.push(range(cursor, segment.start));
    }
    cursor = Math.max(cursor, segment.end);
  }
  if (duration - cursor >= minimumGapSeconds) gaps.push(range(cursor, duration));
  return gaps;
}
