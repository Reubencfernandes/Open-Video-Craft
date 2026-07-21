import { describe, expect, it } from "vitest";
import {
  addLanguageToWhisperWordChunks,
  createWhisperTranscriptionOptions,
  createSubtitleSegmentsFromWhisperOutput,
  formatSubtitleLanguage,
  getWhisperOutputLanguage,
  isMissingWhisperAttentionError
} from "../src/renderer/editor/subtitle-transcription";

describe("subtitle transcription", () => {
  it("auto-detects any spoken language without translating it to English", () => {
    expect(createWhisperTranscriptionOptions("word")).toMatchObject({
      language: null,
      task: "transcribe",
      return_timestamps: "word"
    });
    expect(createWhisperTranscriptionOptions(true)).toMatchObject({
      language: null,
      task: "transcribe",
      return_timestamps: true
    });
  });

  it("groups Whisper word timestamps into subtitle segments with word timing", () => {
    const segments = createSubtitleSegmentsFromWhisperOutput({
      chunks: [
        { text: " Hello", timestamp: [0, 0.3], language: "english" },
        { text: " world.", timestamp: [0.3, 0.75], language: "english" },
        { text: " Next", timestamp: [1.4, 1.7], language: "english" },
        { text: " line", timestamp: [1.7, 2.05], language: "english" }
      ]
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      start: 0,
      end: 0.75,
      text: "Hello world."
    });
    expect(segments[0].words).toEqual([
      { text: "Hello", start: 0, end: 0.3 },
      { text: "world.", start: 0.3, end: 0.75 }
    ]);
    expect(segments[1]).toMatchObject({
      start: 1.4,
      end: 2.05,
      text: "Next line"
    });
  });

  it("falls back to timed subtitle chunks when word timestamps are unavailable", () => {
    const segments = createSubtitleSegmentsFromWhisperOutput({
      chunks: [{ text: "One full sentence", timestamp: [2, 4], language: "english" }]
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      start: 2,
      end: 4,
      text: "One full sentence"
    });
  });

  it("formats the detected language for the UI", () => {
    expect(
      getWhisperOutputLanguage({
        chunks: [{ text: "hola", timestamp: [0, 0.4], language: "spanish" }]
      })
    ).toBe("Spanish");
    expect(formatSubtitleLanguage(null)).toBe("Auto-detected");
  });

  it("keeps language on flattened word chunks from the Transformers.js tokenizer", () => {
    const transcriber = {
      tokenizer: {
        collateWordTimestamps: (
          _tokens: number[],
          _tokenTimestamps: Array<[number, number | null]>,
          _language?: string | null
        ) => [{ text: "bonjour", timestamp: [0, 0.5] }]
      }
    };

    addLanguageToWhisperWordChunks(transcriber);

    expect(
      transcriber.tokenizer.collateWordTimestamps([], [], "french")
    ).toEqual([{ text: "bonjour", timestamp: [0, 0.5], language: "french" }]);
  });

  it("recognizes the missing-attention timestamp export failure", () => {
    expect(
      isMissingWhisperAttentionError(
        new Error("Model outputs must contain cross attentions to extract timestamps.")
      )
    ).toBe(true);
    expect(isMissingWhisperAttentionError(new Error("Network request failed"))).toBe(false);
  });
});
