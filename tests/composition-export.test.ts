import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportTimelineComposition, resolveFfmpegPath } from "../src/main/ffmpeg";
import { resolveArnndnModelPath } from "../src/main/audio-model-path";
import { exportEditorProjectToPath, retimeSubtitlesForSpeed, retimeTextOverlaysForSpeed } from "../src/main/composition-export";
import { buildAudioCleanupFilter, createDefaultEditorState } from "../src/shared/editor-domain";
import type { EditorProjectStateFile, ProjectFile } from "../src/shared/types";

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
  }, 60_000);

  it("applies local speech cleanup filters to exported audio", async () => {
    const ffmpeg = resolveFfmpegPath();
    const video = path.join(directory, "cleanup-video.mp4");
    const tone = path.join(directory, "cleanup-tone.wav");
    const output = path.join(directory, "cleanup-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1", "-ar", "48000", tone]);

    const bytes = await exportTimelineComposition({
      videoSegments: [{ path: video, kind: "video", start: 0, end: 1, sourceStart: 0, volume: 1, hasAudio: false }],
      audioSegments: [{
        path: tone, start: 0, end: 1, sourceStart: 0, volume: 1,
        cleanupFilter: buildAudioCleanupFilter(
          { preset: "wind", strength: 50 },
          resolveArnndnModelPath()
        )
      }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });

    expect(bytes).toBeGreaterThan(1_000);
    const probe = await exec(ffmpeg, ["-i", output]).catch((error: any) => error);
    expect(`${probe.stderr ?? ""}`).toMatch(/Audio:/);
  }, 60_000);

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
  }, 60_000);

  it("applies saved fade-in and fade-out to an audio clip", async () => {
    const ffmpeg = resolveFfmpegPath();
    const video = path.join(directory, "fade-video.mp4");
    const tone = path.join(directory, "fade-tone.wav");
    const output = path.join(directory, "fade-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=4", "-ar", "48000", tone]);

    await exportTimelineComposition({
      videoSegments: [{ id: "video", path: video, kind: "video", start: 0, end: 4, sourceStart: 0, volume: 1, hasAudio: false }],
      audioSegments: [{ path: tone, start: 0, end: 4, sourceStart: 0, volume: 1, fadeIn: 1, fadeOut: 1 }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });

    const decoded = await exec(ffmpeg, [
      "-v", "error", "-i", output, "-vn", "-ac", "1", "-ar", "48000",
      "-f", "s16le", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 32 * 1024 * 1024 } as any);
    const samples = decoded.stdout as Buffer;
    const rms = (from: number, to: number): number => {
      let sum = 0;
      let count = 0;
      for (let index = Math.floor(from * 48_000) * 2; index < Math.floor(to * 48_000) * 2 && index < samples.length; index += 2) {
        const value = samples.readInt16LE(index) / 32_768;
        sum += value * value;
        count += 1;
      }
      return Math.sqrt(sum / Math.max(1, count));
    };
    const middle = rms(1.5, 2.5);
    expect(middle).toBeGreaterThan(0.05);
    expect(rms(0.1, 0.5)).toBeLessThan(middle / 3);
    expect(rms(3.6, 3.95)).toBeLessThan(middle / 3);
  }, 60_000);

  it("keeps audio-track music in real time when a video clip is sped up", async () => {
    const ffmpeg = resolveFfmpegPath();
    const video = path.join(directory, "speed-video.mp4");
    const music = path.join(directory, "speed-music.wav");
    const output = path.join(directory, "speed-audio-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-ar", "48000", music]);

    await exportTimelineComposition({
      videoSegments: [
        { id: "picture", path: video, kind: "video", start: 0, end: 2, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [
        { path: music, start: 0, end: 2, sourceStart: 0, volume: 1, speedAffected: false }
      ],
      speedEffects: [{ start: 0, end: 2, rate: 2 }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });

    const decoded = await exec(ffmpeg, [
      "-v", "error", "-i", output, "-vn", "-ac", "2", "-ar", "48000",
      "-f", "s16le", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 32 * 1024 * 1024 } as any);
    const audioSeconds = (decoded.stdout as Buffer).length / (48_000 * 2 * 2);
    expect(audioSeconds).toBeGreaterThan(1.8);
  }, 60_000);

  it("composites the configured background behind letterboxed clips", async () => {
    const ffmpeg = resolveFfmpegPath();
    const portrait = path.join(directory, "portrait.mp4");
    const background = path.join(directory, "background.png");
    const output = path.join(directory, "background-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=160x180:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", portrait]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1", "-frames:v", "1", background]);

    await exportTimelineComposition({
      videoSegments: [
        { id: "portrait", path: portrait, kind: "video", start: 0, end: 2, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [],
      background: { imagePath: background },
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });

    const side = await exec(ffmpeg, [
      "-ss", "0.5", "-i", output, "-vf", "crop=8:8:40:360",
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 1024 * 1024 } as any);
    const [red, green, blue] = side.stdout as unknown as Buffer;
    expect(blue).toBeGreaterThan(120);
    expect(blue).toBeGreaterThan(red * 2);
    expect(blue).toBeGreaterThan(green * 2);
  }, 60_000);

  it("uses the saved custom background through the project export API", async () => {
    const ffmpeg = resolveFfmpegPath();
    const portrait = path.join(directory, "portrait.mp4");
    const background = path.join(directory, "background.png");
    const output = path.join(directory, "project-background-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=160x180:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", portrait]);
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1", "-frames:v", "1", background]);
    const now = new Date().toISOString();
    const project: ProjectFile = {
      schemaVersion: 1, appVersion: "test", id: "background-project", name: "Background",
      createdAt: now, updatedAt: now, status: "complete", source: null,
      devices: { microphone: { enabled: false, deviceId: null, label: null }, camera: { enabled: false, deviceId: null, label: null } },
      tracks: {}, durationMs: 2_000, startedAt: null, stoppedAt: null, error: null
    };
    const document: EditorProjectStateFile = {
      schemaVersion: 2, revision: 1, savedAt: now,
      state: {
        ...createDefaultEditorState(),
        timelineSegments: [{ id: "portrait-segment", itemId: "portrait", track: "video", lane: 0, start: 0, end: 2, sourceStart: 0 }],
        backgroundStyle: "custom",
        customBackgroundImportId: "background",
        trimRange: { start: 0, end: 2 }
      },
      imports: [
        { id: "portrait", name: "portrait.mp4", kind: "video", extension: "mp4", duration: 2, relativePath: "portrait.mp4" },
        { id: "background", name: "background.png", kind: "image", extension: "png", duration: null, relativePath: "background.png" }
      ],
      lastMutation: { source: "editor", at: now, editId: null, summary: null }
    };

    await exportEditorProjectToPath({
      rootPath: directory, project, document, outputPath: output,
      format: "mp4", resolution: "720p", subtitleMode: "none", trimStart: 0, trimEnd: 2
    });

    const side = await exec(ffmpeg, [
      "-ss", "0.5", "-i", output, "-vf", "crop=8:8:40:360",
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 1024 * 1024 } as any);
    const [, , blue] = side.stdout as unknown as Buffer;
    expect(blue).toBeGreaterThan(120);
  }, 60_000);

  it("renders an animated callout box without FFmpeg filter errors", async () => {
    const ffmpeg = resolveFfmpegPath();
    const video = path.join(directory, "callout-video.mp4");
    const output = path.join(directory, "callout-result.mp4");
    await exec(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);

    const bytes = await exportTimelineComposition({
      videoSegments: [
        { id: "callout-video", path: video, kind: "video", start: 0, end: 2, sourceStart: 0, volume: 1, hasAudio: false }
      ],
      audioSegments: [],
      textOverlays: [{
        id: "callout-1", start: 0.2, end: 1.6, text: "Key point", title: "TOPIC",
        x: 50, y: 25, size: 24, color: "#ffffff", fontFamily: "mono", weight: 700,
        animation: "slide-in-out",
        box: {
          backgroundColor: "#123c8f", backgroundOpacity: 72,
          borderColor: "#66b3ff", borderWidth: 3, borderRadius: 18,
          padding: 22, titleColor: "#9fd1ff", titleSize: 26
        }
      }],
      outputPath: output, format: "mp4", resolution: "720p", trimStart: 0, trimEnd: null
    });
    expect(bytes).toBeGreaterThan(1_000);
    const frame = await exec(ffmpeg, [
      "-ss", "0.8", "-i", output, "-frames:v", "1", "-vf", "scale=1:1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { encoding: "buffer" as any, maxBuffer: 1024 * 1024 } as any);
    expect(frame.stdout.length).toBeGreaterThan(0);
  }, 60_000);

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
  }, 60_000);
});
