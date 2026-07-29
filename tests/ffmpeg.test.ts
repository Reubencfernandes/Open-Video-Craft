import { describe, expect, it } from "vitest";
import {
  canStreamCopy,
  createVideoFilter,
  parseFfmpegDurationMs,
  resolveFfmpegPath,
  toUnpackedPath
} from "../src/main/ffmpeg";
import type { ExportVideoJob } from "../src/main/ffmpeg";
import type { TextOverlay } from "../src/shared/editor-domain";

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

  it("disables stream copy when text overlays must be drawn", () => {
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

    expect(canStreamCopy({ ...job, textOverlays: [] })).toBe(true);
    expect(canStreamCopy({ ...job, textOverlays: [overlay()] })).toBe(false);
  });

  it("draws text overlays under burned-in subtitles", () => {
    const filter = createVideoFilter("source", "/tmp/captions.srt", [overlay()], 720);
    const drawtextIndex = filter.indexOf("drawtext=");
    const subtitlesIndex = filter.indexOf("subtitles=");

    expect(drawtextIndex).toBeGreaterThan(-1);
    expect(subtitlesIndex).toBeGreaterThan(drawtextIndex);
  });

  it("sizes overlay text against the exported frame, not the source", () => {
    // 48px is authored against a 1080-tall frame, so it scales with the output.
    expect(createVideoFilter("720p", null, [overlay({ size: 48 })])).toContain("fontsize=32");
    expect(
      createVideoFilter("source", null, [overlay({ size: 48 })], { width: 1920, height: 1080 })
    ).toContain("fontsize=48");
    // Without a usable probe the filter still renders, at the 1080p size.
    expect(createVideoFilter("source", null, [overlay({ size: 48 })], null)).toContain("fontsize=48");
  });

  it("wraps overlay text within the room the preview leaves it", () => {
    const text = "The user logs in with Instagram and approves the requested permissions";
    // An overlay at x=75 is laid out by CSS shrink-to-fit in the quarter frame
    // to its right, so the export has to break the same text more often than
    // one sitting at the left edge.
    const nearLeft = createVideoFilter("1080p", null, [overlay({ text, x: 0 })]);
    const nearRight = createVideoFilter("1080p", null, [overlay({ text, x: 75 })]);

    expect(countLines(nearRight)).toBeGreaterThan(countLines(nearLeft));
    expect(countLines(nearLeft)).toBeGreaterThan(0);
  });

  it("centres wrapped lines, as the preview does", () => {
    expect(createVideoFilter("1080p", null, [overlay()])).toContain("text_align=C");
  });

  it("keeps newlines literal so drawtext breaks the line", () => {
    // A "\\n" escape reaches drawtext as a bare "n" and prints as one.
    const filter = createVideoFilter("1080p", null, [overlay({ text: "first\nsecond" })]);

    expect(filter).toContain("first\nsecond");
    expect(filter).not.toContain("first\\nsecond");
  });

  it("leaves the filter untouched when there are no overlays", () => {
    expect(createVideoFilter("source", null, [])).toBe("setsar=1");
    expect(createVideoFilter("source", null, null)).toBe("setsar=1");
  });
});

function countLines(filter: string): number {
  const text = /drawtext=text='([\s\S]*?)':fontfile/u.exec(filter)?.[1] ?? "";
  return text.split("\n").length;
}

function overlay(patch: Partial<TextOverlay> = {}): TextOverlay {
  return {
    id: "overlay-1",
    start: 0,
    end: 2,
    text: "Hello",
    x: 50,
    y: 80,
    size: 48,
    color: "#ffffff",
    weight: 400,
    animation: "none",
    ...patch
  };
}
