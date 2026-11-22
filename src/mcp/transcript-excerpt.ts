export interface TranscriptExcerpt {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptExcerptInput {
  analysis: unknown;
  query?: string;
  limit?: number;
  startSeconds?: number;
  endSeconds?: number;
}

export interface TranscriptExcerptResult {
  status: string;
  fingerprint: string | null;
  warnings: string[];
  totalSegments: number;
  returned: number;
  truncated: boolean;
  mode: "query" | "sample";
  excerpts: TranscriptExcerpt[];
}

interface SourceSegment {
  start: number;
  end: number;
  text: string;
}

const MAX_EXCERPTS = 40;
const MAX_EXCERPT_CHARACTERS = 240;
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

function sourceSegments(analysis: Record<string, unknown> | null): SourceSegment[] {
  const transcript = record(analysis?.transcript);
  const segments = transcript?.segments;
  if (!Array.isArray(segments)) return [];
  const result: SourceSegment[] = [];
  for (const candidate of segments) {
    const item = record(candidate);
    const start = finiteNumber(item?.start);
    const end = finiteNumber(item?.end);
    const text = item?.text;
    if (start === null || end === null || typeof text !== "string") continue;
    result.push({ start, end, text: text.slice(0, MAX_EXCERPT_CHARACTERS) });
  }
  return result;
}

function boundedWarnings(analysis: Record<string, unknown> | null): string[] {
  const warnings = analysis?.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_WARNINGS)
    .map((item) => item.slice(0, MAX_WARNING_CHARACTERS));
}

function sample(segments: SourceSegment[], limit: number): SourceSegment[] {
  if (segments.length <= limit) return segments;
  const result: SourceSegment[] = [];
  for (let index = 0; index < limit; index += 1) {
    const position = Math.round(index * (segments.length - 1) / (limit - 1));
    const segment = segments[position];
    if (segment && !result.includes(segment)) result.push(segment);
  }
  return result;
}

export function queryTranscriptExcerpts(input: TranscriptExcerptInput): TranscriptExcerptResult {
  const analysis = record(input.analysis);
  const segments = sourceSegments(analysis);
  const start = finiteNumber(input.startSeconds);
  const end = finiteNumber(input.endSeconds);
  const windowed = segments.filter((segment) =>
    (start === null || segment.end >= start) && (end === null || segment.start <= end)
  );
  const terms = (input.query ?? "").toLowerCase().split(/[\s,;]+/u).filter((term) => term.length > 1);
  const matches = terms.length === 0
    ? windowed
    : windowed.filter((segment) => {
        const text = segment.text.toLowerCase();
        return terms.every((term) => text.includes(term));
      });
  const limit = Math.max(1, Math.min(MAX_EXCERPTS, Math.trunc(finiteNumber(input.limit) ?? 12)));
  const selected = terms.length === 0 ? sample(matches, limit) : matches.slice(0, limit);
  return {
    status: typeof analysis?.status === "string" ? analysis.status : "not-started",
    fingerprint: typeof analysis?.fingerprint === "string" ? analysis.fingerprint : null,
    warnings: boundedWarnings(analysis),
    totalSegments: segments.length,
    returned: selected.length,
    truncated: matches.length > selected.length,
    mode: terms.length === 0 ? "sample" : "query",
    excerpts: selected.map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }))
  };
}
