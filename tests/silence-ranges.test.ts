import { describe, expect, it } from "vitest";
import { querySilenceRanges } from "../src/mcp/silence-ranges";

const analysis = {
  schemaVersion: 2,
  fingerprint: "fingerprint-1",
  status: "complete",
  silenceRanges: [
    { start: 6.3, end: 7.7, duration: 1.4 },
    { start: 34.1, end: 34.7, duration: 0.6 },
    { start: 99.4, end: 100.05, duration: 0.65 },
    { start: 410, end: 411.5, duration: 1.5 }
  ],
  warnings: ["warning ".repeat(50)]
};

describe("querySilenceRanges", () => {
  it("returns only silence ranges inside the requested clip window", () => {
    const result = querySilenceRanges({ analysis, startSeconds: 10.26, endSeconds: 402.37 });
    expect(result.status).toBe("complete");
    expect(result.fingerprint).toBe("fingerprint-1");
    expect(result.totalSilences).toBe(4);
    expect(result.silences).toEqual([
      { start: 34.1, end: 34.7, duration: 0.6 },
      { start: 99.4, end: 100.05, duration: 0.65 }
    ]);
    expect(JSON.stringify(result).length).toBeLessThan(2_000);
  });

  it("clips a range that overlaps the requested window", () => {
    const result = querySilenceRanges({ analysis, startSeconds: 7, endSeconds: 8 });
    expect(result.silences).toEqual([{ start: 7, end: 7.7, duration: 0.7 }]);
  });

  it("supports a minimum duration and a bounded limit", () => {
    const result = querySilenceRanges({ analysis, minDurationSeconds: 1, limit: 1 });
    expect(result.silences).toEqual([{ start: 6.3, end: 7.7, duration: 1.4 }]);
    expect(result.truncated).toBe(true);
  });

  it("handles missing analysis without throwing", () => {
    const result = querySilenceRanges({ analysis: null });
    expect(result.status).toBe("not-started");
    expect(result.silences).toEqual([]);
  });
});
