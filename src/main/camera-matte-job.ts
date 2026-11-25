/**
 * One-time webcam matte job (S9, S12).
 *
 * Background removal has to infer every frame, so it is pre-computed once: the
 * recorded camera file is streamed through the segmentation model and re-encoded
 * with a real alpha channel. Later previews and exports reuse that file, so the
 * expensive pass never happens twice.
 *
 * Frames are piped rather than written to disk: ffmpeg decodes raw RGB on
 * stdout, the mask is applied in memory, and the RGBA frames go straight into a
 * second ffmpeg that encodes transparency (VP9 with yuva420p).
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import type { InferenceSession } from "onnxruntime-node";
import { maskToAlpha, normalizeMask, resizeMask } from "./segmentation-math";
import { probeMediaDurationMs, parseFfmpegSize, resolveFfmpegPath } from "./ffmpeg";

/** Captures ffmpeg's banner, which carries the streams and the frame rate. */
function captureBanner(filePath: string): Promise<string> {
  const ffmpeg = resolveFfmpegPath();
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-nostdin", "-i", filePath], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let output = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", () => resolve(output));
    child.on("close", () => resolve(output));
  });
}

/** Square working frame; a camera bubble never needs more than this. */
export const matteFrameSize = 512;
/** The model's own input resolution. */
export const matteModelSize = 320;
/** Frame rate used for the matte; matched to the source banner when known. */
export const matteFrameRate = 30;

export interface CameraMatteJobInput {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly modelPath: string;
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: { cancelled: boolean };
}

export interface CameraMatteResult {
  readonly frames: number;
  readonly outputPath: string;
}

export class MatteCancelledError extends Error {
  constructor() {
    super("Background removal was cancelled.");
  }
}

/** Source frame rate from the ffmpeg banner, clamped to something sane. */
export function parseFrameRate(banner: string): number | null {
  const match = /,\s*([\d.]+)\s*fps/iu.exec(banner);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) && value >= 1 && value <= 120 ? value : null;
}

function nearestResize(
  rgb: Uint8Array,
  sourceSize: number,
  targetSize: number
): Float32Array {
  // The model expects NCHW: planar channels, not interlaced RGB pixels. Values
  // are scaled to 0..1 and normalized with the ImageNet mean/std it was trained on.
  const planeSize = targetSize * targetSize;
  const result = new Float32Array(planeSize * 3);
  const scale = sourceSize / targetSize;
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  for (let y = 0; y < targetSize; y += 1) {
    const sourceY = Math.min(sourceSize - 1, Math.floor((y + 0.5) * scale));
    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = Math.min(sourceSize - 1, Math.floor((x + 0.5) * scale));
      const sourceIndex = (sourceY * sourceSize + sourceX) * 3;
      const targetIndex = y * targetSize + x;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = rgb[sourceIndex + channel] / 255;
        result[channel * planeSize + targetIndex] = (value - mean[channel]) / std[channel];
      }
    }
  }
  return result;
}

async function loadSession(modelPath: string): Promise<InferenceSession> {
  const ort = await import("onnxruntime-node");
  return ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
}

/** Runs the model and returns a 0..1 mask for one frame. */
export async function segmentFrame(
  session: InferenceSession,
  rgb: Uint8Array,
  sourceSize = matteFrameSize
): Promise<Float32Array> {
  const ort = await import("onnxruntime-node");
  const input = nearestResize(rgb, sourceSize, matteModelSize);
  const tensor = new ort.Tensor("float32", input, [1, 3, matteModelSize, matteModelSize]);
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error("The background model exposes no input.");
  const outputs = await session.run({ [inputName]: tensor });
  const first = outputs[session.outputNames[0] ?? Object.keys(outputs)[0]];
  const data = first?.data;
  if (!(data instanceof Float32Array)) {
    throw new Error("The background model returned an unexpected output.");
  }
  return normalizeMask(data);
}

/**
 * Renders the matte file. Progress is reported per frame so the UI can show a
 * real estimate; cancellation stops both ffmpeg processes.
 */
export async function renderCameraMatte(
  input: CameraMatteJobInput
): Promise<CameraMatteResult> {
  const ffmpeg = resolveFfmpegPath();
  const banner = await captureBanner(input.sourcePath);
  const size = parseFfmpegSize(banner);
  const frameRate = parseFrameRate(banner) ?? matteFrameRate;
  if (!size) throw new Error("The recorded camera has no readable video stream.");
  const durationMs = await probeMediaDurationMs(input.sourcePath);
  const totalFrames = durationMs ? Math.max(1, Math.round((durationMs / 1000) * frameRate)) : null;

  const session = await loadSession(input.modelPath);

  const decoder = spawn(ffmpeg, [
    "-nostdin", "-i", input.sourcePath, "-an",
    "-vf", `scale=${matteFrameSize}:${matteFrameSize}:force_original_aspect_ratio=increase,crop=${matteFrameSize}:${matteFrameSize}`,
    "-r", String(frameRate), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
  ], { stdio: ["ignore", "pipe", "pipe"] });

  const encoder = spawn(ffmpeg, [
    "-y", "-nostdin",
    // A grayscale mask, not an alpha video: the bundled ffmpeg has no VP9 alpha
    // support, so transparency is composited from this mask instead.
    "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${matteFrameSize}x${matteFrameSize}`,
    "-r", String(frameRate), "-i", "pipe:0",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "1M", "-an",
    input.outputPath
  ], { stdio: ["pipe", "ignore", "pipe"] });

  let decoderError = "";
  decoder.stderr.setEncoding("utf8");
  decoder.stderr.on("data", (chunk: string) => {
    decoderError += chunk;
  });
  let encoderError = "";
  encoder.stderr.setEncoding("utf8");
  encoder.stderr.on("data", (chunk: string) => {
    encoderError += chunk;
  });

  const frameBytes = matteFrameSize * matteFrameSize * 3;
  let pending = Buffer.alloc(0);
  let frames = 0;

  const writeFrame = async (rgb: Uint8Array): Promise<void> => {
    const mask = await segmentFrame(session, rgb);
    const scaled = resizeMask(mask, matteModelSize, matteModelSize, matteFrameSize, matteFrameSize);
    const alpha = maskToAlpha(scaled);
    const gray = new Uint8Array(matteFrameSize * matteFrameSize);
    for (let index = 0; index < gray.length; index += 1) gray[index] = alpha[index];
    if (!encoder.stdin.write(Buffer.from(gray.buffer))) {
      await new Promise<void>((resolve) => encoder.stdin.once("drain", () => resolve()));
    }
    frames += 1;
    if (totalFrames) input.onProgress?.(Math.min(0.99, frames / totalFrames));
  };

  try {
    for await (const chunk of decoder.stdout) {
      if (input.signal?.cancelled) throw new MatteCancelledError();
      pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      while (pending.length >= frameBytes) {
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        await writeFrame(frame);
      }
    }
    encoder.stdin.end();
    await new Promise<void>((resolve, reject) => {
      encoder.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Encoding the matte failed: ${encoderError.slice(-400)}`));
      });
      encoder.on("error", reject);
    });
  } catch (error) {
    decoder.kill("SIGTERM");
    encoder.kill("SIGTERM");
    await fs.rm(input.outputPath, { force: true });
    if (error instanceof MatteCancelledError) throw error;
    throw new Error(
      `Background removal failed: ${error instanceof Error ? error.message : String(error)}${
        decoderError ? ` (${decoderError.slice(-300)})` : ""
      }`
    );
  } finally {
    session.release?.();
  }

  if (frames === 0) {
    await fs.rm(input.outputPath, { force: true });
    throw new Error("The recorded camera produced no frames to process.");
  }
  input.onProgress?.(1);
  return { frames, outputPath: input.outputPath };
}
