/** Pure FFmpeg progress parsing and export timeout policy. */

export function parseFfmpegProgressSeconds(
  key: string,
  value: string
): number | null {
  if (key === "out_time_us" || key === "out_time_ms") {
    const microseconds = Number(value);
    return Number.isFinite(microseconds) && microseconds >= 0
      ? microseconds / 1_000_000
      : null;
  }
  if (key === "out_time") {
    const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/u.exec(value);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return null;
}

export function calculateExportPercent(
  elapsedSeconds: number,
  durationSeconds: number
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(99, (elapsedSeconds / durationSeconds) * 100));
}

/** Allow slow software exports while still bounding corrupt/hung processes. */
export function calculateExportTimeoutMs(durationSeconds: number): number {
  const estimated = Math.max(0, durationSeconds) * 30_000;
  return Math.round(Math.max(5 * 60_000, Math.min(2 * 60 * 60_000, estimated)));
}
