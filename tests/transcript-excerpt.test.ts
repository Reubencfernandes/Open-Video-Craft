import { describe, expect, it } from "vitest";
import { queryTranscriptExcerpts } from "../src/mcp/transcript-excerpt";

const analysis = {
  schemaVersion: 2,
  projectId: "project-1",
  fingerprint: "fingerprint-1",
  status: "complete",
  transcript: {
    language: "en",
    segments: [
      { start: 1, end: 2, text: "Welcome to the channel.", words: [{ start: 1, end: 2, text: "Welcome" }] },
      { start: 3, end: 4, text: "Today we discuss Python packaging.", words: [] },
      { start: 5, end: 6, text: "The Python API is useful.", words: [] },
      { start: 7, end: 8, text: "Thank you for watching.", words: [] }
    ]
  },
  warnings: ["a warning " + "x".repeat(400)]
};

describe("queryTranscriptExcerpts", () => {
  it("returns only bounded excerpts matching the query", () => {
    const result = queryTranscriptExcerpts({ analysis, query: "Python API", limit: 10 });
    expect(result.status).toBe("complete");
    expect(result.fingerprint).toBe("fingerprint-1");
    expect(result.totalSegments).toBe(4);
    expect(result.mode).toBe("query");
    expect(result.excerpts).toEqual([{ start: 5, end: 6, text: "The Python API is useful." }]);
    expect(JSON.stringify(result).length).toBeLessThan(2_000);
  });

  it("samples evenly across the transcript when no query is given", () => {
    const result = queryTranscriptExcerpts({ analysis, limit: 2 });
    expect(result.mode).toBe("sample");
    expect(result.excerpts).toHaveLength(2);
    expect(result.excerpts[0]?.start).toBe(1);
    expect(result.excerpts[1]?.start).toBe(7);
  });

  it("respects an explicit time window", () => {
    const result = queryTranscriptExcerpts({ analysis, startSeconds: 3, endSeconds: 6, query: "Python" });
    expect(result.excerpts.map((item) => item.start)).toEqual([3, 5]);
  });

  it("handles missing analysis without throwing", () => {
    const result = queryTranscriptExcerpts({ analysis: null });
    expect(result.status).toBe("not-started");
    expect(result.excerpts).toEqual([]);
    expect(result.totalSegments).toBe(0);
  });
});
