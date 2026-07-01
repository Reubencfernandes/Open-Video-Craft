import { describe, expect, it } from "vitest";
import { getFfmpegStatus, resolveFfmpegPath, resolveFfprobePath } from "../src/main/ffmpeg";

describe("FFmpeg binaries", () => {
  it("resolves bundled FFmpeg and FFprobe paths", () => {
    expect(resolveFfmpegPath()).toMatch(/ffmpeg/i);
    expect(resolveFfprobePath()).toMatch(/ffprobe/i);
    expect(getFfmpegStatus()).toEqual({
      ffmpegPath: resolveFfmpegPath(),
      ffprobePath: resolveFfprobePath()
    });
  });
});
