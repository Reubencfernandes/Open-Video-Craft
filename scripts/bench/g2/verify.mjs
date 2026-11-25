import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function probeMedia(filePath, ffprobe = "ffprobe") {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error", "-of", "json",
    "-show_entries", "stream=index,codec_name,codec_type,width,height,r_frame_rate,pix_fmt:format=duration,format_name",
    filePath
  ], { maxBuffer: 8 * 1024 * 1024 });
  const value = JSON.parse(stdout);
  if (!Array.isArray(value.streams) || value.streams.length < 2) {
    throw new Error("finalized file has no video and audio streams");
  }
  return value;
}

export async function decodeFully(filePath, ffmpeg) {
  await execFileAsync(ffmpeg, [
    "-v", "error", "-xerror", "-i", filePath, "-f", "null", "-"
  ], { maxBuffer: 8 * 1024 * 1024 });
}

export function hasFaststartAtoms(buffer) {
  const text = buffer.toString("latin1");
  const moov = text.indexOf("moov");
  const mdat = text.indexOf("mdat");
  return moov >= 0 && mdat >= 0 && moov < mdat;
}

export async function verifyFinalizedFile(filePath, ffmpeg, ffprobe = "ffprobe") {
  const probe = await probeMedia(filePath, ffprobe);
  await decodeFully(filePath, ffmpeg);
  const buffer = await readFile(filePath);
  return {
    status: "PASS",
    bytes: buffer.length,
    streams: probe.streams.map((stream) => ({
      codec: stream.codec_name,
      type: stream.codec_type,
      width: stream.width ?? null,
      height: stream.height ?? null
    })),
    faststart: hasFaststartAtoms(buffer)
  };
}
