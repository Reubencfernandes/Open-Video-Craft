import { describe, expect, it } from "vitest";
import {
  calculateExportPercent,
  calculateExportTimeoutMs,
  parseFfmpegProgressSeconds
} from "../src/main/ffmpeg-progress";

describe("FFmpeg progress", () => {
  it("parses machine progress timestamps", () => {
    expect(parseFfmpegProgressSeconds("out_time_us", "2500000")).toBe(2.5);
    expect(parseFfmpegProgressSeconds("out_time", "00:01:02.500")).toBe(62.5);
  });

  it("caps active progress below completion", () => {
    expect(calculateExportPercent(5, 10)).toBe(50);
    expect(calculateExportPercent(20, 10)).toBe(99);
  });

  it("bounds the wall-clock timeout", () => {
    expect(calculateExportTimeoutMs(1)).toBe(300_000);
    expect(calculateExportTimeoutMs(60 * 60)).toBe(7_200_000);
  });
});
