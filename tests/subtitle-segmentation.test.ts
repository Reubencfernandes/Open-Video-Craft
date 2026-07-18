import { describe, expect, it } from "vitest";
import {
  clampSegments,
  createSubtitleSegmentsFromPlainText,
  maxCharactersPerSubtitle,
  maxWordsPerSubtitle
} from "../src/shared/subtitle-segmentation";

let counter = 0;
const createId = (prefix: string) => `${prefix}-${(counter += 1)}`;

describe("createSubtitleSegmentsFromPlainText", () => {
  it("returns nothing for empty text or an empty window", () => {
    expect(createSubtitleSegmentsFromPlainText("", 0, 10, createId)).toEqual([]);
    expect(createSubtitleSegmentsFromPlainText("hello", 5, 5, createId)).toEqual([]);
  });

  it("spans exactly the provided window", () => {
    const segments = createSubtitleSegmentsFromPlainText(
      "This is the first sentence. And here comes a second, slightly longer sentence to split.",
      30,
      60,
      createId
    );
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0].start).toBe(30);
    expect(segments.at(-1)?.end).toBe(60);
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].start).toBeGreaterThanOrEqual(segments[i - 1].start);
    }
  });

  it("respects the word and character caps", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const segments = createSubtitleSegmentsFromPlainText(words, 0, 40, createId);
    for (const segment of segments) {
      expect(segment.text.split(" ").length).toBeLessThanOrEqual(maxWordsPerSubtitle);
      expect(segment.text.length).toBeLessThanOrEqual(maxCharactersPerSubtitle + 8);
    }
  });

  it("breaks at sentence boundaries", () => {
    const segments = createSubtitleSegmentsFromPlainText("One two. Three four.", 0, 4, createId);
    expect(segments.map((segment) => segment.text)).toEqual(["One two.", "Three four."]);
  });

  it("allocates more time to longer pieces", () => {
    const segments = createSubtitleSegmentsFromPlainText(
      "Hi. This one is a much much much longer sentence.",
      0,
      10,
      createId
    );
    const short = segments[0];
    const rest = segments.slice(1);
    const restDuration = rest.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
    expect(restDuration).toBeGreaterThan(short.end - short.start);
  });
});

describe("clampSegments", () => {
  it("drops empty text, keeps order monotonic, enforces min duration", () => {
    const segments = clampSegments([
      { id: "a", start: 5, end: 5.05, text: "first" },
      { id: "b", start: 2, end: 8, text: "overlaps backwards" },
      { id: "c", start: 9, end: 10, text: "   " }
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].end).toBeCloseTo(5.3, 5);
    expect(segments[1].start).toBeGreaterThanOrEqual(segments[0].end);
    expect(segments[1].end).toBeGreaterThan(segments[1].start);
  });
});
