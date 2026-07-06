import type { SubtitleSegment, SubtitleWord } from "./types";
import { createId } from "./utils";

export const whisperTranscriptionModel = "Xenova/whisper-base";
export const whisperTranscriptionModelLabel = "Whisper base (multilingual)";

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

const maxWordsPerSubtitle = 7;
const maxCharactersPerSubtitle = 46;
const subtitlePauseBreakSeconds = 0.45;

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
  const segments: SubtitleSegment[] = [];
  let group: SubtitleWord[] = [];

  for (const word of words) {
    const previous = group.at(-1);
    const nextText = formatSubtitleText([...group, word]);
    const shouldBreakBeforeWord =
      group.length > 0 &&
      (group.length >= maxWordsPerSubtitle ||
        nextText.length > maxCharactersPerSubtitle ||
        (previous ? word.start - previous.end > subtitlePauseBreakSeconds : false) ||
        endsSentence(previous?.text ?? ""));

    if (shouldBreakBeforeWord) {
      segments.push(createSegmentFromWords(group));
      group = [];
    }

    group.push(word);
  }

  if (group.length > 0) {
    segments.push(createSegmentFromWords(group));
  }

  return segments;
}

function createSegmentFromWords(words: SubtitleWord[]): SubtitleSegment {
  const firstWord = words[0];
  const lastWord = words.at(-1) ?? firstWord;

  return {
    id: createId("subtitle"),
    start: firstWord.start,
    end: Math.max(firstWord.start + 0.4, lastWord.end),
    text: formatSubtitleText(words),
    words
  };
}

function normalizeWordText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function hasInternalWhitespace(text: string): boolean {
  return /\s/.test(text.trim());
}

function formatSubtitleText(words: SubtitleWord[]): string {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.;:!?)}\]])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .trim();
}

function endsSentence(text: string): boolean {
  return /[.!?]$/.test(text.trim());
}

function formatLanguageName(language: string): string {
  return language
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
