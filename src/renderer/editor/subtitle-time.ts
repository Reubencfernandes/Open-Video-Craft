import type { SubtitleSegment } from "./types";

export const subtitleMinimumDuration = 0.1;

/** Precise, human-readable subtitle timecodes used by the inline editor. */
export function formatSubtitleTimecode(seconds: number): string {
  const totalMilliseconds = Math.max(
    0,
    Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000)
  );
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const secondsPart = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutesPart = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`
    : `${String(totalMinutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;

  return `${clock}.${String(milliseconds).padStart(3, "0")}`;
}

/** Accepts seconds, MM:SS.mmm, or HH:MM:SS.mmm. */
export function parseSubtitleTimecode(value: string): number | null {
  const parts = value.trim().replace(/,/g, ".").split(":").map((part) => part.trim());
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => part.trim() === "")) {
    return null;
  }

  const decimalPattern = /^\d+(?:\.\d+)?$/;
  const integerPattern = /^\d+$/;
  if (!decimalPattern.test(parts.at(-1) ?? "")) return null;
  if (parts.length >= 2 && !integerPattern.test(parts.at(-2) ?? "")) return null;
  if (parts.length === 3 && !integerPattern.test(parts[0])) return null;

  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  if (parts.length === 1) {
    return Math.round(numbers[0] * 1000) / 1000;
  }

  const seconds = numbers.at(-1) ?? 0;
  const minutes = numbers.at(-2) ?? 0;
  const hours = parts.length === 3 ? numbers[0] : 0;
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) {
    return null;
  }

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) / 1000;
}

/** Keep generated subtitle ranges and word timings inside the actual media duration. */
export function clampSubtitleSegmentsToDuration(
  segments: SubtitleSegment[],
  duration: number
): SubtitleSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return segments;
  const maximum = Math.max(subtitleMinimumDuration, duration);

  return segments.map((segment) => {
    const rawStart = Number.isFinite(segment.start) ? segment.start : 0;
    const rawEnd = Number.isFinite(segment.end) ? segment.end : rawStart + subtitleMinimumDuration;
    const start = Math.min(
      Math.max(0, rawStart),
      Math.max(0, maximum - subtitleMinimumDuration)
    );
    const end = Math.min(maximum, Math.max(start + subtitleMinimumDuration, rawEnd));
    const words = segment.words
      ?.map((word) => ({
        ...word,
        start: Math.min(end, Math.max(start, Number.isFinite(word.start) ? word.start : start)),
        end: Math.min(end, Math.max(start, Number.isFinite(word.end) ? word.end : end))
      }))
      .filter((word) => word.end > word.start);

    return {
      ...segment,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      ...(segment.words ? { words } : {})
    };
  });
}
