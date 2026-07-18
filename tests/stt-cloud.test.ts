import { describe, expect, it } from "vitest";
import {
  mapGeminiSegments,
  parseClockTimestamp,
  pickChunkBoundaries
} from "../src/main/stt-cloud";

describe("parseClockTimestamp", () => {
  it("parses MM:SS and MM:SS.mmm", () => {
    expect(parseClockTimestamp("00:05")).toBe(5);
    expect(parseClockTimestamp("01:30.500")).toBeCloseTo(90.5);
    expect(parseClockTimestamp("1:02:03")).toBe(3723);
  });

  it("accepts bare seconds and rejects junk", () => {
    expect(parseClockTimestamp("12.5")).toBe(12.5);
    expect(parseClockTimestamp("abc")).toBeNull();
    expect(parseClockTimestamp("-3")).toBeNull();
  });
});

describe("pickChunkBoundaries", () => {
  it("keeps short audio as one chunk", () => {
    expect(pickChunkBoundaries(45, [])).toEqual([{ start: 0, end: 45 }]);
  });

  it("cuts at the silence nearest the 60s target", () => {
    const chunks = pickChunkBoundaries(200, [
      { start: 55, end: 57 },
      { start: 90, end: 91 }
    ]);
    expect(chunks[0]).toEqual({ start: 0, end: 56 });
    expect(chunks[0].end - chunks[0].start).toBeLessThanOrEqual(120);
    expect(chunks.at(-1)?.end).toBe(200);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].start).toBe(chunks[i - 1].end);
    }
  });

  it("caps chunks at 120s when there is no usable silence", () => {
    const chunks = pickChunkBoundaries(300, []);
    for (const chunk of chunks) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(120);
    }
    expect(chunks.at(-1)?.end).toBe(300);
  });
});

describe("mapGeminiSegments", () => {
  it("offsets timestamps by the chunk start and clamps to the chunk", () => {
    const segments = mapGeminiSegments(
      [
        { start: "00:01", end: "00:03", text: "hello there" },
        { start: "00:50", end: "01:30", text: "runs past the chunk" }
      ],
      { start: 60, end: 120 }
    );
    expect(segments[0].start).toBe(61);
    expect(segments[0].end).toBe(63);
    expect(segments[1].end).toBeLessThanOrEqual(120);
  });

  it("drops unparsable or empty segments", () => {
    const segments = mapGeminiSegments(
      [
        { start: "junk", end: "00:03", text: "bad start" },
        { start: "00:01", end: "00:02", text: "   " }
      ],
      { start: 0, end: 30 }
    );
    expect(segments).toEqual([]);
  });

  it("splits over-long text into caption-sized pieces", () => {
    const longText = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const segments = mapGeminiSegments(
      [{ start: "00:00", end: "00:20", text: longText }],
      { start: 0, end: 30 }
    );
    expect(segments.length).toBeGreaterThan(1);
  });
});
