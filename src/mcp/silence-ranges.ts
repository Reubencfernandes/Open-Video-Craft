export interface SilenceRangeExcerpt {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceRangeInput {
  analysis: unknown;
  startSeconds?: number;
  endSeconds?: number;
  minDurationSeconds?: number;
  limit?: number;
}

export interface SilenceRangeResult {
  status: string;
  fingerprint: string | null;
  warnings: string[];
  totalSilences: number;
  returned: number;
  truncated: boolean;
  silences: SilenceRangeExcerpt[];
}

interface SourceSilence {
  start: number;
  end: number;
  duration: number;
}

const MAX_SILENCES = 40;
const MAX_WARNING_CHARACTERS = 300;
const MAX_WARNINGS = 3;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function milliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function sourceSilences(analysis: Record<string, unknown> | null): SourceSilence[] {
  const ranges = analysis?.silenceRanges;
  if (!Array.isArray(ranges)) return [];
  const result: SourceSilence[] = [];
  for (const candidate of ranges) {
    const item = record(candidate);
    const start = finiteNumber(item?.start);
    const end = finiteNumber(item?.end);
    if (start === null || end === null || end <= start) continue;
    const declared = finiteNumber(item?.duration);
    result.push({ start: milliseconds(start), end: milliseconds(end), duration: milliseconds(declared ?? end - start) });
  }
  return result.sort((left, right) => left.start - right.start);
}

function boundedWarnings(analysis: Record<string, unknown> | null): string[] {
  const warnings = analysis?.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_WARNINGS)
    .map((item) => item.slice(0, MAX_WARNING_CHARACTERS));
}

export function querySilenceRanges(input: SilenceRangeInput): SilenceRangeResult {
  const analysis = record(input.analysis);
  const all = sourceSilences(analysis);
  const start = finiteNumber(input.startSeconds);
  const end = finiteNumber(input.endSeconds);
  const minimum = finiteNumber(input.minDurationSeconds);
  const clipped = all.flatMap((silence) => {
    const boundedStart = start === null ? silence.start : Math.max(silence.start, start);
    const boundedEnd = end === null ? silence.end : Math.min(silence.end, end);
    if (boundedEnd <= boundedStart) return [];
    return [{ start: milliseconds(boundedStart), end: milliseconds(boundedEnd), duration: milliseconds(boundedEnd - boundedStart) }];
  });
  const filtered = clipped.filter((silence) => minimum === null || silence.duration >= minimum);
  const limit = Math.max(1, Math.min(MAX_SILENCES, Math.trunc(finiteNumber(input.limit) ?? 40)));
  const selected = filtered.slice(0, limit);
  return {
    status: typeof analysis?.status === "string" ? analysis.status : "not-started",
    fingerprint: typeof analysis?.fingerprint === "string" ? analysis.fingerprint : null,
    warnings: boundedWarnings(analysis),
    totalSilences: all.length,
    returned: selected.length,
    truncated: filtered.length > selected.length,
    silences: selected.map((silence) => ({ ...silence }))
  };
}
