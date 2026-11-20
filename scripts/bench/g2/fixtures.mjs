import { execFile } from "node:child_process";
import { rename } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function fixturePlan(durationSeconds = 2, fps = 30) {
  return {
    durationSeconds,
    fps,
    video: {
      codec: "libx264",
      size: "1920x1080",
      filter: "testsrc=size=1920x1080:rate=30"
    },
    audio: {
      codec: "pcm_s16le",
      rate: 48_000,
      filter: "sine=frequency=1000:sample_rate=48000"
    }
  };
}

export async function generateFixtures(directory, ffmpeg, plan = fixturePlan()) {
  const videoPath = `${directory}/source.mp4`;
  const audioPath = `${directory}/flash-beep.wav`;
  await execFileAsync(ffmpeg, [
    "-hide_banner", "-nostdin", "-y",
    "-f", "lavfi", "-i", plan.video.filter,
    "-t", String(plan.durationSeconds),
    "-c:v", plan.video.codec, "-pix_fmt", "yuv420p",
    "-g", "60", "-movflags", "+faststart", videoPath
  ], { maxBuffer: 16 * 1024 * 1024 });
  await execFileAsync(ffmpeg, [
    "-hide_banner", "-nostdin", "-y",
    "-f", "lavfi", "-i", plan.audio.filter,
    "-t", String(plan.durationSeconds),
    "-c:a", plan.audio.codec, "-ar", String(plan.audio.rate), audioPath
  ], { maxBuffer: 16 * 1024 * 1024 });
  return { videoPath, audioPath, plan };
}

export async function muxFinalizedFile(directory, sources, ffmpeg) {
  const output = `${directory}/g2-finalized.mp4`;
  const partial = `${output}.part`;
  await execFileAsync(ffmpeg, [
    "-hide_banner", "-nostdin", "-y",
    "-i", sources.videoPath, "-i", sources.audioPath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-ar", "48000",
    "-f", "mp4", "-movflags", "+faststart",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    partial
  ], { maxBuffer: 16 * 1024 * 1024 });
  await rename(partial, output);
  return output;
}
