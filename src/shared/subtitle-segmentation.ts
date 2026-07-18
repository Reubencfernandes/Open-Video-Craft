/**
 * Pure subtitle segmentation shared by the renderer (Whisper output) and the
 * main process (cloud transcription providers). Keep this module free of DOM
 * and Node dependencies; callers supply their own id factory.
 */
import type { SubtitleSegment, SubtitleWord } from "./editor-domain/types";

export const maxWordsPerSubtitle = 7;
export const maxCharactersPerSubtitle = 46;
export const subtitlePauseBreakSeconds = 0.45;

export type SubtitleIdFactory = (prefix: string) => string;

export function groupSubtitleWords(
  words: SubtitleWord[],
  createId: SubtitleIdFactory
): SubtitleSegment[] {
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
      segments.push(createSegmentFromWords(group, createId));
      group = [];
    }

    group.push(word);
  }

  if (group.length > 0) {
    segments.push(createSegmentFromWords(group, createId));
  }

  return segments;
}

export function createSegmentFromWords(
  words: SubtitleWord[],
  createId: SubtitleIdFactory
): SubtitleSegment {
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

export function formatSubtitleText(words: SubtitleWord[]): string {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.;:!?)}\]])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .trim();
}

export function endsSentence(text: string): boolean {
  return /[.!?]$/.test(text.trim());
}

/**
 * Turns a plain transcript (no timestamps — e.g. Cohere Transcribe output for
 * one audio chunk) into subtitle segments spanning [windowStart, windowEnd].
 * Time is distributed across pieces proportionally to their character count,
 * which is the best available approximation when the provider gives none.
 */
export function createSubtitleSegmentsFromPlainText(
  text: string,
  windowStart: number,
  windowEnd: number,
  createId: SubtitleIdFactory
): SubtitleSegment[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const windowDuration = Math.max(0, windowEnd - windowStart);

  if (!normalized || windowDuration <= 0) {
    return [];
  }

  const pieces = splitPlainTextIntoPieces(normalized);
  const totalCharacters = pieces.reduce((sum, piece) => sum + piece.length, 0);

  if (pieces.length === 0 || totalCharacters === 0) {
    return [];
  }

  const segments: SubtitleSegment[] = [];
  let cursor = windowStart;

  for (const piece of pieces) {
    const duration = (piece.length / totalCharacters) * windowDuration;
    const start = cursor;
    const end = Math.min(windowEnd, start + duration);
    cursor = end;

    segments.push({
      id: createId("subtitle"),
      start,
      end,
      text: piece
    });
  }

  const lastSegment = segments.at(-1);
  if (lastSegment) {
    lastSegment.end = windowEnd;
  }

  return clampSegments(segments);
}

function splitPlainTextIntoPieces(text: string): string[] {
  // Sentence-first split keeps captions readable; long sentences are then
  // re-split under the word/character caps used for Whisper output.
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [text];
  const pieces: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    let group: string[] = [];

    for (const word of words) {
      const nextText = [...group, word].join(" ");
      if (
        group.length > 0 &&
        (group.length >= maxWordsPerSubtitle || nextText.length > maxCharactersPerSubtitle)
      ) {
        pieces.push(group.join(" "));
        group = [];
      }
      group.push(word);
    }

    if (group.length > 0) {
      pieces.push(group.join(" "));
    }
  }

  return pieces;
}

/**
 * Normalizes provider-supplied segments: non-negative, monotonic, and with a
 * minimum readable duration. Segments with no text are dropped.
 */
export function clampSegments(
  segments: SubtitleSegment[],
  minDuration = 0.3
): SubtitleSegment[] {
  const result: SubtitleSegment[] = [];
  let previousEnd = 0;

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }

    const start = Math.max(previousEnd, Math.max(0, segment.start));
    const end = Math.max(start + minDuration, segment.end);
    previousEnd = end;

    result.push({ ...segment, text, start, end });
  }

  return result;
}
