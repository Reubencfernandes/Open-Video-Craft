import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic = require("ffprobe-static");
import type { ExportResolution, ExportVideoFormat, FfmpegStatus } from "../shared/types";

interface ExportVideoJob {
  videoPath: string;
  audioPaths: string[];
  outputPath: string;
  format: ExportVideoFormat;
  resolution: ExportResolution;
  trimStart: number;
  trimEnd: number | null;
  volume: number;
  preserveSourceAudio: boolean;
}

export function resolveFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error("No FFmpeg binary is available for this platform.");
  }

  return ffmpegStatic;
}

export function resolveFfprobePath(): string {
  if (!ffprobeStatic.path) {
    throw new Error("No FFprobe binary is available for this platform.");
  }

  return ffprobeStatic.path;
}

export function getFfmpegStatus(): FfmpegStatus {
  return {
    ffmpegPath: resolveFfmpegPath(),
    ffprobePath: resolveFfprobePath()
  };
}

// MediaRecorder writes a headerless chunk stream: no duration, no seek cues.
// A stream-copy remux rewrites the container so <video> elements can report a
// finite duration and seek reliably. The original file is replaced in place.
export async function remuxWebm(filePath: string): Promise<void> {
  const inputStats = await fs.stat(filePath).catch(() => null);

  if (!inputStats || inputStats.size === 0) {
    return;
  }

  const tempPath = `${filePath}.remux.webm`;

  try {
    await runProcess(resolveFfmpegPath(), ["-y", "-i", filePath, "-c", "copy", tempPath]);

    const outputStats = await fs.stat(tempPath).catch(() => null);
    if (!outputStats || outputStats.size === 0) {
      throw new Error("Remuxing produced an empty file.");
    }

    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function convertWebmAudioToWav(inputPath: string, outputPath: string): Promise<number> {
  const inputStats = await fs.stat(inputPath).catch(() => null);

  if (!inputStats || inputStats.size === 0) {
    return 0;
  }

  await runProcess(resolveFfmpegPath(), [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    outputPath
  ]);

  const outputStats = await fs.stat(outputPath);
  return outputStats.size;
}

export async function exportVideo(job: ExportVideoJob): Promise<number> {
  const outputDuration =
    job.trimEnd && job.trimEnd > job.trimStart ? job.trimEnd - job.trimStart : null;
  const args: string[] = ["-y"];

  addInput(args, job.videoPath, job.trimStart);

  for (const audioPath of job.audioPaths) {
    addInput(args, audioPath, job.trimStart);
  }

  if (outputDuration) {
    args.push("-t", formatFfmpegNumber(outputDuration));
  }

  const videoFilter = createVideoFilter(job.resolution);
  const audioInputCount = job.audioPaths.length;

  if (audioInputCount > 1) {
    const audioFilters = job.audioPaths
      .map((_audioPath, index) => {
        const volume = index === 0 ? clampVolume(job.volume) : 0.55;
        return `[${index + 1}:a]volume=${formatFfmpegNumber(volume)}[a${index}]`;
      })
      .join(";");
    const mixInputs = job.audioPaths.map((_audioPath, index) => `[a${index}]`).join("");
    args.push(
      "-filter_complex",
      `${audioFilters};${mixInputs}amix=inputs=${audioInputCount}:duration=longest:dropout_transition=0[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]"
    );
  } else if (audioInputCount === 1) {
    args.push(
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-af",
      `volume=${formatFfmpegNumber(clampVolume(job.volume))}`
    );
  } else {
    args.push("-map", "0:v:0");

    if (job.preserveSourceAudio) {
      args.push("-map", "0:a?");
    } else {
      args.push("-an");
    }
  }

  if (videoFilter) {
    args.push("-vf", videoFilter);
  }

  args.push(...createCodecArgs(job.format), job.outputPath);
  await runProcess(resolveFfmpegPath(), args);

  const outputStats = await fs.stat(job.outputPath);
  return outputStats.size;
}

function addInput(args: string[], inputPath: string, trimStart: number): void {
  if (trimStart > 0) {
    args.push("-ss", formatFfmpegNumber(trimStart));
  }

  args.push("-i", inputPath);
}

function createVideoFilter(resolution: ExportResolution): string | null {
  const dimensions = getResolutionDimensions(resolution);

  if (!dimensions) {
    return "setsar=1";
  }

  const [width, height] = dimensions;
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1"
  ].join(",");
}

function getResolutionDimensions(resolution: ExportResolution): [number, number] | null {
  switch (resolution) {
    case "720p":
      return [1280, 720];
    case "1080p":
      return [1920, 1080];
    case "1440p":
      return [2560, 1440];
    case "source":
      return null;
  }
}

function createCodecArgs(format: ExportVideoFormat): string[] {
  if (format === "webm") {
    return [
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "30",
      "-c:a",
      "libopus",
      "-b:a",
      "128k"
    ];
  }

  return [
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart"
  ];
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }

  return Math.min(2, Math.max(0, volume));
}

function formatFfmpegNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code ?? "unknown"}: ${stderr}`));
    });
  });
}
