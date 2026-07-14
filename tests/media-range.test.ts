import { describe, expect, it } from "vitest";
import { parseByteRange } from "../src/main/media-range";

describe("local media byte ranges", () => {
  it("parses bounded and open-ended byte ranges", () => {
    expect(parseByteRange("bytes=100-199", 1_000)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=900-", 1_000)).toEqual({ start: 900, end: 999 });
  });

  it("parses suffix ranges and clamps their start", () => {
    expect(parseByteRange("bytes=-100", 1_000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-2000", 1_000)).toEqual({ start: 0, end: 999 });
  });

  it("rejects invalid or out-of-bounds ranges", () => {
    expect(parseByteRange("bytes=1000-", 1_000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=200-100", 1_000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,4-5", 1_000)).toBe("unsatisfiable");
  });
});
