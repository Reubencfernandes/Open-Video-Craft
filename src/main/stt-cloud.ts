/**
 * Cloud speech-to-text (Cohere Transcribe / Gemini) run from the main process
 * so API keys never reach the renderer and the strict renderer CSP stays
 * untouched.
 *
 * Pipeline: ffmpeg mixes the audible timeline sources into one 16 kHz mono
 * MP3 → silence-aligned chunks (~60 s, ≤120 s) keep uploads far below the
 * provider limits (Cohere 25 MB, Gemini 20 MB inline) → per-chunk provider
 * calls → SubtitleSegment mapping. Cohere returns plain text only, so chunk
 * boundaries are its only real timestamps; text within a chunk is distributed
 * proportionally by createSubtitleSegmentsFromPlainText.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SubtitleSegment } from "../shared/editor-domain";
import {
  clampSegments,
  createSubtitleSegmentsFromPlainText,
  maxCharactersPerSubtitle
} from "../shared/subtitle-segmentation";
import type {
  SttProgressEvent,
  SttTranscribeRequest,
  SttTranscribeResult,
  SttTranscribeSource
} from "../shared/types";
import { mediaHasAudio, probeMediaDurationMs, resolveFfmpegPath } from "./ffmpeg";
import { cohereTranscribeModel } from "./provider-keys";

export interface SilenceRange {
  start: number;
  end: number;
}

export interface AudioChunk {
  start: number;
  end: number;
}

export interface SttCloudDependencies {
  /** Resolves an ovc-media:// / ovc-import:// URL to an absolute path. */
  resolveSourcePath: (url: string) => string | null;
  getApiKey: (provider: "cohere" | "gemini") => Promise<string | null>;
  getCohereLanguage: () => Promise<string>;
  scratchDirectory: string;
  onProgress: (event: Omit<SttProgressEvent, "requestId">) => void;
  signal: AbortSignal;
}

const targetChunkSeconds = 60;
const maxChunkSeconds = 120;
const minChunkSeconds = 20;
const geminiSttModel = "gemini-3.5-flash";

const createSegmentId = (prefix: string) => `${prefix}-${randomUUID()}`;

export async function transcribeCloud(
  request: SttTranscribeRequest,
  deps: SttCloudDependencies
): Promise<SttTranscribeResult> {
  const workDirectory = path.join(deps.scratchDirectory, request.requestId);
  await fs.mkdir(workDirectory, { recursive: true });

  try {
    deps.onProgress({ phase: "extracting", percent: 0 });
    const mixedPath = await mixSourcesToMono16k(request.sources, workDirectory, deps);
    deps.onProgress({ phase: "extracting", percent: 15 });

    const durationMs = await probeMediaDurationMs(mixedPath);
    const durationSeconds = (durationMs ?? 0) / 1000;
    if (!durationSeconds) {
      throw new Error("No audio could be extracted from the selected sources.");
    }

    const silenceRanges = await detectSilenceRanges(mixedPath, deps.signal);
    const chunks = pickChunkBoundaries(durationSeconds, silenceRanges);
    deps.onProgress({ phase: "extracting", percent: 20 });

    const apiKey = await deps.getApiKey(request.provider);
    if (!apiKey) {
      throw new Error(
        `No ${request.provider === "cohere" ? "Cohere" : "Gemini"} API key is saved. Add one in the AI settings.`
      );
    }

    const segments: SubtitleSegment[] = [];
    let language: string | null = null;
    const cohereLanguage = await deps.getCohereLanguage();

    for (const [index, chunk] of chunks.entries()) {
      throwIfAborted(deps.signal);
      const chunkPath = path.join(workDirectory, `chunk-${index}.mp3`);
      await extractChunk(mixedPath, chunk, chunkPath, deps.signal);

      const progressBase = 20 + (index / chunks.length) * 80;
      deps.onProgress({
        phase: "uploading",
        percent: progressBase,
        chunkIndex: index + 1,
        chunkCount: chunks.length
      });

      const chunkBytes = await fs.readFile(chunkPath);
      deps.onProgress({
        phase: "transcribing",
        percent: progressBase + (0.4 / chunks.length) * 80,
        chunkIndex: index + 1,
        chunkCount: chunks.length
      });

      if (request.provider === "cohere") {
        const text = await transcribeChunkWithCohere(chunkBytes, apiKey, cohereLanguage, deps.signal);
        segments.push(
          ...createSubtitleSegmentsFromPlainText(text, chunk.start, chunk.end, createSegmentId)
        );
        language = language ?? formatLanguageLabel(cohereLanguage);
      } else {
        const chunkResult = await transcribeChunkWithGemini(chunkBytes, apiKey, deps.signal);
        segments.push(...mapGeminiSegments(chunkResult.segments, chunk));
        language = language ?? chunkResult.language;
      }
    }

    return { language, segments: clampSegments(segments) };
  } finally {
    await fs.rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Audio preparation                                                   */
/* ------------------------------------------------------------------ */

async function mixSourcesToMono16k(
  sources: SttTranscribeSource[],
  workDirectory: string,
  deps: SttCloudDependencies
): Promise<string> {
  const resolved: Array<SttTranscribeSource & { path: string }> = [];
  for (const source of sources) {
    const filePath = deps.resolveSourcePath(source.url);
    if (!filePath) {
      continue;
    }
    if (await mediaHasAudio(filePath).catch(() => false)) {
      resolved.push({ ...source, path: filePath });
    }
  }

  if (resolved.length === 0) {
    throw new Error("None of the selected sources contain an audio track.");
  }

  const outputPath = path.join(workDirectory, "mixed.mp3");
  const args: string[] = ["-y"];
  const filters: string[] = [];

  for (const [index, source] of resolved.entries()) {
    args.push("-ss", source.sourceStart.toFixed(3), "-t", source.duration.toFixed(3), "-i", source.path);
    const delayMs = Math.max(0, Math.round(source.timelineOffset * 1000));
    filters.push(
      `[${index}:a]aresample=16000,aformat=channel_layouts=mono,` +
        `volume=${clampGain(source.gain).toFixed(3)},adelay=${delayMs}:all=1[a${index}]`
    );
  }

  const mixInputs = resolved.map((_, index) => `[a${index}]`).join("");
  filters.push(
    `${mixInputs}amix=inputs=${resolved.length}:duration=longest:normalize=0[mix]`
  );

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[mix]",
    "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "48k",
    outputPath
  );

  await runFfmpeg(args, deps.signal);
  return outputPath;
}

async function extractChunk(
  mixedPath: string,
  chunk: AudioChunk,
  outputPath: string,
  signal: AbortSignal
): Promise<void> {
  await runFfmpeg(
    [
      "-y",
      "-ss", chunk.start.toFixed(3),
      "-t", (chunk.end - chunk.start).toFixed(3),
      "-i", mixedPath,
      "-c:a", "libmp3lame", "-b:a", "48k",
      outputPath
    ],
    signal
  );
}

async function detectSilenceRanges(
  filePath: string,
  signal: AbortSignal
): Promise<SilenceRange[]> {
  const stderr = await runFfmpeg(
    ["-i", filePath, "-af", "silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"],
    signal,
    { captureStderr: true, allowInfoLog: true }
  );
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return starts
    .map((start, index) => ({ start, end: ends[index] ?? start }))
    .filter((range) => range.end > range.start);
}

/**
 * Chooses chunk boundaries: aim for ~60 s per chunk, cut inside a detected
 * silence when one exists near the target, and never exceed 120 s.
 */
export function pickChunkBoundaries(
  durationSeconds: number,
  silenceRanges: SilenceRange[]
): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  let cursor = 0;

  while (durationSeconds - cursor > maxChunkSeconds) {
    const target = cursor + targetChunkSeconds;
    const windowStart = cursor + minChunkSeconds;
    const windowEnd = cursor + maxChunkSeconds;

    let cut = windowEnd;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const range of silenceRanges) {
      const midpoint = (range.start + range.end) / 2;
      if (midpoint <= windowStart || midpoint >= windowEnd) {
        continue;
      }
      const distance = Math.abs(midpoint - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        cut = midpoint;
      }
    }

    chunks.push({ start: cursor, end: cut });
    cursor = cut;
  }

  chunks.push({ start: cursor, end: durationSeconds });
  return chunks;
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

async function transcribeChunkWithCohere(
  audio: Buffer,
  apiKey: string,
  language: string,
  signal: AbortSignal
): Promise<string> {
  const form = new FormData();
  form.append("model", cohereTranscribeModel);
  form.append("language", language);
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");

  const response = await fetch("https://api.cohere.com/v2/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal
  });

  if (!response.ok) {
    throw new Error(await describeProviderError("Cohere", response));
  }

  const body = (await response.json()) as { text?: unknown };
  return typeof body.text === "string" ? body.text : "";
}

interface GeminiSttSegment {
  start: string;
  end: string;
  text: string;
}

async function transcribeChunkWithGemini(
  audio: Buffer,
  apiKey: string,
  signal: AbortSignal
): Promise<{ language: string | null; segments: GeminiSttSegment[] }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiSttModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/mp3", data: audio.toString("base64") } },
              {
                text:
                  "Transcribe this audio verbatim. Split the transcript into short caption " +
                  "segments (max ~7 words each) with accurate start/end timestamps relative " +
                  "to the start of this audio, formatted as MM:SS.mmm. Report the spoken " +
                  "language name in English. If there is no speech, return an empty segments array."
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              language: { type: "string" },
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" },
                    text: { type: "string" }
                  },
                  required: ["start", "end", "text"]
                }
              }
            },
            required: ["segments"]
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(await describeProviderError("Gemini", response));
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  let parsed: { language?: unknown; segments?: unknown };
  try {
    parsed = JSON.parse(text) as { language?: unknown; segments?: unknown };
  } catch {
    throw new Error("Gemini returned a response that could not be parsed as JSON.");
  }

  const segments = Array.isArray(parsed.segments)
    ? parsed.segments.filter(
        (segment): segment is GeminiSttSegment =>
          Boolean(segment) &&
          typeof (segment as GeminiSttSegment).start === "string" &&
          typeof (segment as GeminiSttSegment).end === "string" &&
          typeof (segment as GeminiSttSegment).text === "string"
      )
    : [];

  return {
    language: typeof parsed.language === "string" && parsed.language ? parsed.language : null,
    segments
  };
}

export function mapGeminiSegments(
  segments: GeminiSttSegment[],
  chunk: AudioChunk
): SubtitleSegment[] {
  const mapped: SubtitleSegment[] = [];

  for (const segment of segments) {
    const start = parseClockTimestamp(segment.start);
    const end = parseClockTimestamp(segment.end);
    const text = segment.text.replace(/\s+/g, " ").trim();
    if (start === null || end === null || !text) {
      continue;
    }

    const absoluteStart = chunk.start + start;
    const absoluteEnd = Math.min(chunk.end, chunk.start + Math.max(end, start));

    if (text.length <= maxCharactersPerSubtitle) {
      mapped.push({
        id: createSegmentId("subtitle"),
        start: absoluteStart,
        end: absoluteEnd,
        text
      });
    } else {
      mapped.push(
        ...createSubtitleSegmentsFromPlainText(text, absoluteStart, absoluteEnd, createSegmentId)
      );
    }
  }

  return mapped;
}

/** Parses "MM:SS", "MM:SS.mmm", or "H:MM:SS(.mmm)" into seconds. */
export function parseClockTimestamp(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) {
    const plain = Number(value);
    return Number.isFinite(plain) && plain >= 0 ? plain : null;
  }
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

async function describeProviderError(provider: string, response: Response): Promise<string> {
  const detail = await response.text().then((text) => text.slice(0, 300)).catch(() => "");
  switch (response.status) {
    case 401:
    case 403:
      return `${provider} rejected the API key. Check it in the AI settings.`;
    case 413:
      return `${provider} rejected the audio chunk as too large.`;
    case 429:
      return `${provider} rate limit reached. Wait a moment and try again.`;
    default:
      return `${provider} transcription failed (HTTP ${response.status}). ${detail}`.trim();
  }
}

function formatLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: "English", de: "German", fr: "French", it: "Italian", es: "Spanish",
    pt: "Portuguese", el: "Greek", nl: "Dutch", pl: "Polish", vi: "Vietnamese",
    zh: "Chinese", ar: "Arabic", ja: "Japanese", ko: "Korean"
  };
  return labels[code] ?? code;
}

function clampGain(gain: number): number {
  return Math.min(4, Math.max(0, Number.isFinite(gain) ? gain : 1));
}

/* ------------------------------------------------------------------ */
/* ffmpeg plumbing                                                     */
/* ------------------------------------------------------------------ */

const activeSttProcesses = new Set<ChildProcess>();

export function killActiveSttProcesses(): void {
  for (const child of activeSttProcesses) {
    child.kill("SIGKILL");
  }
  activeSttProcesses.clear();
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Transcription cancelled.");
  }
}

function runFfmpeg(
  args: string[],
  signal: AbortSignal,
  options: { captureStderr?: boolean; allowInfoLog?: boolean } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Transcription cancelled."));
      return;
    }

    const logArgs = options.allowInfoLog ? [] : ["-loglevel", "error"];
    const child = spawn(
      resolveFfmpegPath(),
      ["-hide_banner", "-nostdin", ...logArgs, ...args],
      { windowsHide: true }
    );
    activeSttProcesses.add(child);

    let stderr = "";
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      activeSttProcesses.delete(child);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(stderr);
    };
    const abort = () => {
      child.kill("SIGKILL");
      finish(new Error("Transcription cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-64_000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      finish(
        code === 0
          ? null
          : new Error(`Audio preparation failed (FFmpeg exited ${code}): ${stderr.slice(-2000)}`)
      );
    });
  });
}
