import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic = require("ffprobe-static");
import type { FfmpegStatus } from "../shared/types";

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
