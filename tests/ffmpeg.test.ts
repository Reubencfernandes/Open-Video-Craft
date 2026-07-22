import { describe, expect, it } from "vitest";
import {
  canStreamCopy,
  createVideoFilter,
  parseFfmpegDurationMs,
  resolveFfmpegPath,
  toUnpackedPath
} from "../src/main/ffmpeg";
import type { ExportVideoJob } from "../src/main/ffmpeg";

describe("FFmpeg binaries", () => {
  it("resolves the bundled FFmpeg path", () => {
    expect(resolveFfmpegPath()).toMatch(/ffmpeg/i);
  });

  it("rewrites app.asar paths to app.asar.unpacked paths", () => {
    expect(
      toUnpackedPath(
        "/Applications/Open Video Craft.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg"
      )
    ).toBe(
      "/Applications/Open Video Craft.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
    );

    expect(
      toUnpackedPath(
        "C:\\Users\\me\\AppData\\Local\\Programs\\Open Video Craft\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe"
      )
    ).toBe(
      "C:\\Users\\me\\AppData\\Local\\Programs\\Open Video Craft\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe"
    );
  });

  it("parses remuxed media duration metadata", () => {
    expect(parseFfmpegDurationMs("Duration: 01:02:03.456, start: 0.000000")).toBe(3_723_456);
    expect(parseFfmpegDurationMs("Duration: N/A")).toBeNull();
  });

  it("adds escaped burn-in subtitles to the raw video filter", () => {
    expect(createVideoFilter("source", "C:\\clips\\captions.srt")).toBe(
      "setsar=1,subtitles='C\\:/clips/captions.srt'"
    );
    expect(createVideoFilter("720p", null)).toBe(
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1"
    );
  });

  it("disables stream copy when subtitles must be burned in", () => {
    const job: ExportVideoJob = {
      videoPath: "/tmp/source.mp4",
      audioTracks: [],
      outputPath: "/tmp/output.mp4",
      format: "mp4",
      resolution: "source",
      trimStart: 0,
      trimEnd: null,
      sourceAudioVolume: 1,
      preserveSourceAudio: true
    };

    expect(canStreamCopy(job)).toBe(true);
    expect(canStreamCopy({ ...job, subtitlePath: "/tmp/captions.srt" })).toBe(false);
  });
});
