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
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => part.trim() === "")) {
    return null;
  }

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
