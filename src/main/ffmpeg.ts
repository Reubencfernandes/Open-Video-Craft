/**
 * FFmpeg integration: resolving the bundled binary (asar-unpacked), remuxing
 * chunked WebM recordings so they seek, converting mic/system audio to WAV,
 * and running the export encode.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import type { ExportResolution, ExportVideoFormat } from "../shared/types";

interface ExportVideoJob {
  videoPath: string;
  audioTracks: Array<{ path: string; volume: number }>;
  outputPath: string;
  format: ExportVideoFormat;
  resolution: ExportResolution;
  trimStart: number;
  trimEnd: number | null;
  sourceAudioVolume: number;
  preserveSourceAudio: boolean;
}

// ffmpeg-static reports a path inside app.asar, but asar archives are files,
// so spawning from them fails with ENOTDIR. The binary is asarUnpack'ed next
// to the archive; point at that copy when packaged.
export function toUnpackedPath(binaryPath: string): string {
  return binaryPath.replace(/([/\\])app\.asar([/\\])/, "$1app.asar.unpacked$2");
}

function resolveBundledBinaryPath(binaryPath: string, binaryName: string): string {
  const unpackedPath = toUnpackedPath(binaryPath);

  if (unpackedPath !== binaryPath && !existsSync(unpackedPath)) {
    throw new Error(
      `${binaryName} was resolved inside app.asar, but the unpacked binary was not found at "${unpackedPath}". Check the electron-builder asarUnpack configuration.`
    );
  }

  return unpackedPath;
}

export function resolveFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error("No FFmpeg binary is available for this platform.");
  }

  return resolveBundledBinaryPath(ffmpegStatic, "FFmpeg");
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

// A PCM WAV header is ~44 bytes; a track carrying any real audio is far larger
// (48 kHz stereo 16-bit is ~192 KB/s). When a captured stream produced no
// samples (e.g. a system-audio loopback track the OS opened but never fed),
// ffmpeg still writes a header-only WAV. Registering that as a playable track
// makes the editor fail with "no supported sources", so treat it as no audio.
const minimumMeaningfulWavBytes = 1024;

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

  const outputStats = await fs.stat(outputPath).catch(() => null);
  const bytes = outputStats?.size ?? 0;

  if (bytes < minimumMeaningfulWavBytes) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    return 0;
  }

  return bytes;
}

export async function exportVideo(job: ExportVideoJob): Promise<number> {
  const outputDuration =
    job.trimEnd && job.trimEnd > job.trimStart ? job.trimEnd - job.trimStart : null;
  const args: string[] = ["-y"];

  addInput(args, job.videoPath, job.trimStart);

  for (const track of job.audioTracks) {
    addInput(args, track.path, job.trimStart);
  }

  if (outputDuration) {
    args.push("-t", formatFfmpegNumber(outputDuration));
  }

  const videoFilter = createVideoFilter(job.resolution);
  const audioInputs = [
    ...(job.preserveSourceAudio
      ? [{ inputIndex: 0, volume: job.sourceAudioVolume }]
      : []),
    ...job.audioTracks.map((track, index) => ({ inputIndex: index + 1, volume: track.volume }))
  ];

  if (audioInputs.length > 1) {
    const audioFilters = audioInputs
      .map((input, index) =>
        `[${input.inputIndex}:a]volume=${formatFfmpegNumber(clampVolume(input.volume))}[a${index}]`
      )
      .join(";");
    const mixInputs = audioInputs.map((_input, index) => `[a${index}]`).join("");
    args.push(
      "-filter_complex",
      `${audioFilters};${mixInputs}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]"
    );
  } else if (audioInputs.length === 1) {
    const input = audioInputs[0];
    args.push(
      "-map",
      "0:v:0",
      "-map",
      `${input.inputIndex}:a${input.inputIndex === 0 ? "?" : ":0"}`,
      "-af",
      `volume=${formatFfmpegNumber(clampVolume(input.volume))}`
    );
  } else {
    args.push("-map", "0:v:0");
    args.push("-an");
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

  // Allow up to a ~+12 dB boost to match the editor's master gain range.
  return Math.min(4, Math.max(0, volume));
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

    child.on("error", (error: Error & { code?: string }) => {
      const reason = error.code ? `${error.code}: ${error.message}` : error.message;
      reject(new Error(`Failed to start FFmpeg at "${command}". ${reason}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code ?? "unknown"}: ${stderr}`));
    });
  });
}
