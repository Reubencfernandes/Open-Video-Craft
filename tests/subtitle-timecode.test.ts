import { describe, expect, it } from "vitest";
import {
  formatSubtitleTimecode,
  parseSubtitleTimecode
} from "../src/renderer/editor/subtitle-time";

describe("subtitle timecodes", () => {
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
  });
});
