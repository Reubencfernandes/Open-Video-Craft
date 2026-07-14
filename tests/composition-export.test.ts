import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportTimelineComposition, resolveFfmpegPath } from "../src/main/ffmpeg";
import { retimeSubtitlesForSpeed, retimeTextOverlaysForSpeed } from "../src/main/composition-export";

const exec = promisify(execFile);
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-composition-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe("timeline composition export", () => {
  it("retimes subtitle cues through trimmed speed regions", () => {
    expect(retimeSubtitlesForSpeed(
      [
        { start: 1, end: 5, text: "first" },
        { start: 5, end: 7, text: "second" }
      ],
      [{ start: 2, end: 4, rate: 2 }],
      1,
      7
    )).toEqual([
      { start: 0, end: 3, text: "first" },
      { start: 3, end: 5, text: "second" }
    ]);
  });

  it("retimes styled text overlays without losing their presentation", () => {
    expect(retimeTextOverlaysForSpeed(
      [{ id: "title", start: 1, end: 5, text: "Hello", x: 50, y: 30, size: 72, color: "#ffffff", weight: 700, animation: "pop" }],
      [{ start: 2, end: 4, rate: 2 }],
      1,
      7
    )).toEqual([
      { id: "title", start: 0, end: 3, text: "Hello", x: 50, y: 30, size: 72, color: "#ffffff", weight: 700, animation: "pop" }
    ]);
  });

  it("renders reordered clips, an intentional gap, and delayed audio", async () => {
    const ffmpeg = resolveFfmpegPath();
    const red = path.join(directory, "red.mp4");
    const blue = path.join(directory, "blue.mp4");
    const tone = path.join(directory, "tone.wav");
    const subtitles = path.join(directory, "captions.srt");
    const output = path.join(directory, "result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ar", "48000", tone]);
    await fs.writeFile(subtitles, "1\r\n00:00:00,100 --> 00:00:00,900\r\nHello AI\r\n");

    const bytes = await exportTimelineComposition({
      videoSegments: [
        { path: blue, kind: "video", start: 0, end: 1, sourceStart: 0, volume: 1, hasAudio: false },
        { path: red, kind: "video", start: 1.25, end: 2.25, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [{ path: tone, start: 0.5, end: 1.5, sourceStart: 0, volume: 0.5 }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null,
      subtitlePath: subtitles,
      textOverlays: [{
        start: 0.2, end: 1.8, text: "Overlay", x: 50, y: 25,
        size: 64, color: "#ffffff", weight: 700, animation: "fade"
      }]
    });
    expect(bytes).toBeGreaterThan(1_000);
    const probe = await exec(ffmpeg, ["-i", output]).catch((error: any) => error);
    const diagnostics = `${probe.stderr ?? ""}`;
    const duration = diagnostics.match(/Duration:\s*00:00:([\d.]+)/)?.[1];
    expect(Number(duration)).toBeCloseTo(2.25, 1);
    expect(diagnostics).toMatch(/Video:/);
    expect(diagnostics).toMatch(/Audio:/);
  }, 20_000);

  it("renders a fixed-duration crossfade between adjacent clips", async () => {
    const ffmpeg = resolveFfmpegPath();
    const red = path.join(directory, "transition-red.mp4");
    const blue = path.join(directory, "transition-blue.mp4");
    const output = path.join(directory, "transition-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);

    await exportTimelineComposition({
      videoSegments: [
        { id: "red", path: red, kind: "video", start: 0, end: 1, sourceStart: 0, volume: 1, hasAudio: false },
        { id: "blue", path: blue, kind: "video", start: 1, end: 2, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [],
      transitions: [{ fromSegmentId: "red", toSegmentId: "blue", type: "crossfade", duration: 0.6 }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });

    const probe = await exec(ffmpeg, ["-i", output]).catch((error: any) => error);
    const duration = `${probe.stderr ?? ""}`.match(/Duration:\s*00:00:([\d.]+)/)?.[1];
    expect(Number(duration)).toBeCloseTo(2, 1);
    const middle = await exec(ffmpeg, [
      "-ss", "1", "-i", output, "-frames:v", "1", "-vf", "scale=1:1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 1024 * 1024 } as any);
    const [redChannel, , blueChannel] = middle.stdout as unknown as Buffer;
    expect(redChannel).toBeGreaterThan(30);
    expect(blueChannel).toBeGreaterThan(30);
  }, 20_000);

  it("renders focus zoom and keeps video, mixed audio, and duration synced through speed", async () => {
    const ffmpeg = resolveFfmpegPath();
    const source = path.join(directory, "effects-source.mp4");
    const tone = path.join(directory, "effects-tone.wav");
    const output = path.join(directory, "effects-result.mp4");
    await exec(ffmpeg, [
      "-y", "-f", "lavfi", "-i",
      "color=c=blue:s=320x180:r=30:d=2,drawbox=x=0:y=0:w=160:h=180:color=red:t=fill",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", source
    ]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-ar", "48000", tone]);

    await exportTimelineComposition({
      videoSegments: [
        { id: "effect-video", path: source, kind: "video", start: 0, end: 2, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [{ path: tone, start: 0, end: 2, sourceStart: 0, volume: 1 }],
      zoomEffects: [{
        start: 0, end: 2, speed: "fast", easing: "ease-in-out",
        scale: 2, targetX: 0, targetY: 50
      }],
      speedEffects: [{ start: 0, end: 2, rate: 2 }],
      outputPath: output,
      format: "mp4",
      resolution: "720p",
      trimStart: 0,
      trimEnd: null
    });

    const probe = await exec(ffmpeg, ["-i", output]).catch((error: any) => error);
    const diagnostics = `${probe.stderr ?? ""}`;
    const duration = diagnostics.match(/Duration:\s*00:00:([\d.]+)/)?.[1];
    expect(Number(duration)).toBeCloseTo(1, 1);
    expect(diagnostics).toMatch(/Audio:/);

    const frame = await exec(ffmpeg, [
      "-ss", "0.5", "-i", output, "-frames:v", "1", "-vf", "scale=1:1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 1024 * 1024 } as any);
    const [redChannel, , blueChannel] = frame.stdout as unknown as Buffer;
    expect(redChannel).toBeGreaterThan(blueChannel * 2);
  }, 20_000);
});
