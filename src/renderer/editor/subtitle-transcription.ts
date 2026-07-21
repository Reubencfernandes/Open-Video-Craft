/**
 * Whisper transcription glue: model id, word-chunk language patching, and
 * converting Whisper output into subtitle segments.
 */
import { groupSubtitleWords as groupSubtitleWordsShared } from "../../shared/subtitle-segmentation";
import type { SubtitleSegment, SubtitleWord } from "./types";
import { createId } from "./utils";

// The timestamped export includes the decoder cross-attention outputs required
// by Transformers.js for word-level timestamps. The regular ONNX export can
// transcribe text, but throws when `return_timestamps: "word"` is requested.
export const whisperTranscriptionModel = "onnx-community/whisper-base_timestamped";
export const whisperTranscriptionModelLabel = "Whisper base";

/** Whisper stays multilingual: null lets the model detect the spoken language. */
export function createWhisperTranscriptionOptions(
  returnTimestamps: true | "word"
): Record<string, unknown> {
  return {
    return_timestamps: returnTimestamps,
    language: null,
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5
  };
}

export function isMissingWhisperAttentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cross attentions|output_attentions=True/i.test(message);
}

type WhisperTimestamp = [number | null, number | null];

type WhisperChunk = {
  text?: string;
  timestamp?: WhisperTimestamp;
  language?: string | null;
};

export type WhisperTranscriptionOutput = {
  text?: string;
  chunks?: WhisperChunk[];
};

type WhisperTokenizerWithPrivateHooks = {
  collateWordTimestamps?: (
    tokens: number[],
    tokenTimestamps: Array<[number, number | null]>,
    language?: string | null
  ) => WhisperChunk[];
  openVideoCraftLanguagePatchApplied?: boolean;
};

type WhisperPipelineWithTokenizer = {
  tokenizer?: WhisperTokenizerWithPrivateHooks;
};

export function addLanguageToWhisperWordChunks(transcriber: unknown): void {
  const tokenizer = (transcriber as WhisperPipelineWithTokenizer).tokenizer;
  const originalCollate = tokenizer?.collateWordTimestamps;

  if (!tokenizer || !originalCollate || tokenizer.openVideoCraftLanguagePatchApplied) {
    return;
  }

  tokenizer.collateWordTimestamps = (tokens, tokenTimestamps, language) =>
    originalCollate.call(tokenizer, tokens, tokenTimestamps, language).map((word) => ({
      ...word,
      language: word.language ?? language ?? null
    }));
  tokenizer.openVideoCraftLanguagePatchApplied = true;
}

export function getWhisperOutputLanguage(output: WhisperTranscriptionOutput): string | null {
  const language = output.chunks?.find((chunk) => chunk.language)?.language ?? null;
  return language ? formatLanguageName(language) : null;
}

export function createSubtitleSegmentsFromWhisperOutput(
  output: WhisperTranscriptionOutput
): SubtitleSegment[] {
  const words = createSubtitleWords(output.chunks ?? []);

  if (words.length > 0) {
    return groupSubtitleWords(words);
  }

  return createSubtitleSegmentsFromTimedChunks(output.chunks ?? []);
}

export function formatSubtitleLanguage(language: string | null): string {
  return language ?? "Auto-detected";
}

function createSubtitleWords(chunks: WhisperChunk[]): SubtitleWord[] {
  return chunks
    .map((chunk, index, all) => {
      const text = normalizeWordText(chunk.text);
      const start = chunk.timestamp?.[0];

      if (!text || hasInternalWhitespace(text) || typeof start !== "number") {
        return null;
      }

      const nextStart = all[index + 1]?.timestamp?.[0];
      const end = chunk.timestamp?.[1] ?? nextStart ?? start + 0.28;

      return {
        text,
        start: Math.max(0, start),
        end: Math.max(start + 0.05, end)
      };
    })
    .filter((word): word is SubtitleWord => Boolean(word));
}

function createSubtitleSegmentsFromTimedChunks(chunks: WhisperChunk[]): SubtitleSegment[] {
  return chunks
    .filter((chunk) => chunk.text && chunk.text.trim().length > 0)
    .map((chunk, index, all) => {
      const start = Math.max(0, chunk.timestamp?.[0] ?? 0);
      const rawEnd = chunk.timestamp?.[1] ?? all[index + 1]?.timestamp?.[0] ?? start + 2;

      return {
        id: createId("subtitle"),
        start,
        end: Math.max(start + 0.4, rawEnd),
        text: chunk.text?.trim() ?? ""
      };
    });
}

function groupSubtitleWords(words: SubtitleWord[]): SubtitleSegment[] {
  return groupSubtitleWordsShared(words, createId);
}

function normalizeWordText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function hasInternalWhitespace(text: string): boolean {
  return /\s/.test(text.trim());
}

function formatLanguageName(language: string): string {
  return language
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
