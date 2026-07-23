import { describe, expect, it } from "vitest";
import {
  clampSubtitleSegmentsToDuration,
  findActiveSubtitleAtTime,
  formatSubtitleTimecode,
  getSubtitleTimelineProgressPosition,
  isSubtitleActiveAtTime,
  parseSubtitleTimecode
} from "../src/renderer/editor/subtitle-time";

describe("subtitle timecodes", () => {
  it("switches adjacent cues at a half-open boundary", () => {
    const first = { id: "first", start: 0, end: 1, text: "First" };
    const second = { id: "second", start: 1, end: 2, text: "Second" };

    expect(findActiveSubtitleAtTime([first, second], 0.999)).toBe(first);
    expect(isSubtitleActiveAtTime(first, 1)).toBe(false);
    expect(isSubtitleActiveAtTime(second, 1)).toBe(true);
    expect(findActiveSubtitleAtTime([first, second], 1)).toBe(second);
    expect(findActiveSubtitleAtTime([first, second], 2)).toBeNull();
  });

  it("grows progress toward the next sorted cue", () => {
    const first = { id: "first", start: 10, end: 12, text: "First" };
    const second = { id: "second", start: 20, end: 22, text: "Second" };
    const third = { id: "third", start: 30, end: 32, text: "Third" };

    expect(getSubtitleTimelineProgressPosition([third, first, second], 19.86)).toEqual({
      fromId: "first",
      toId: "second",
      progress: 0.5
    });
    expect(getSubtitleTimelineProgressPosition([third, first, second], 29.86)).toEqual({
      fromId: "second",
      toId: "third",
      progress: 0.5
    });
    expect(getSubtitleTimelineProgressPosition([third, first, second], 15)).toBeNull();
    expect(getSubtitleTimelineProgressPosition([third, first, second], 9.9)).toBeNull();
    expect(getSubtitleTimelineProgressPosition([third, first, second], 30)).toBeNull();
  });

  it("removes floating-point noise while preserving milliseconds", () => {
    expect(formatSubtitleTimecode(0.439999999999)).toBe("00:00.440");
    expect(formatSubtitleTimecode(2.299999999999)).toBe("00:02.300");
    expect(formatSubtitleTimecode(3723.456)).toBe("01:02:03.456");
  });

  it("accepts seconds and clock-formatted edits", () => {
    expect(parseSubtitleTimecode("2.3")).toBe(2.3);
    expect(parseSubtitleTimecode("01:02.345")).toBe(62.345);
    expect(parseSubtitleTimecode("01:02:03.456")).toBe(3723.456);
    expect(parseSubtitleTimecode("00:02,500")).toBe(2.5);
  });

  it("rejects malformed clock values", () => {
    expect(parseSubtitleTimecode("")).toBeNull();
    expect(parseSubtitleTimecode("00:75.000")).toBeNull();
    expect(parseSubtitleTimecode("00:61:00.000")).toBeNull();
    expect(parseSubtitleTimecode("not-a-time")).toBeNull();
    expect(parseSubtitleTimecode("1.5:02.000")).toBeNull();
    expect(parseSubtitleTimecode("01:1.5:02.000")).toBeNull();
    expect(parseSubtitleTimecode("1e2")).toBeNull();
    expect(parseSubtitleTimecode("+2.5")).toBeNull();
    expect(parseSubtitleTimecode("01:02:03:04")).toBeNull();
  });

  it("bounds generated subtitle and word timestamps to the media duration", () => {
    expect(clampSubtitleSegmentsToDuration([{
      id: "subtitle-1",
      start: 40.74,
      end: 11_111,
      text: "July 16th.",
      words: [
        { text: "July", start: 40.74, end: 40.9 },
        { text: "16th.", start: 11_000, end: 11_111 }
      ]
    }], 90)).toEqual([{
      id: "subtitle-1",
      start: 40.74,
      end: 90,
      text: "July 16th.",
      words: [{ text: "July", start: 40.74, end: 40.9 }]
    }]);
  });
});
