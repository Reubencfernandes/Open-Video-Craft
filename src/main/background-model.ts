/**
 * Local person-segmentation model used to remove a webcam background without a
 * green screen (S9, S12).
 *
 * The model is downloaded once into the app's user-data folder, verified, and
 * reused, so a packaged build stays small and the owner never ships a model they
 * did not ask for. The download is resumable at file granularity: an interrupted
 * transfer leaves a `.part` file that is discarded, never used.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface ModelAssetSpec {
  readonly name: string;
  readonly url: string;
  readonly fileName: string;
  /** Approximate download size, shown to the owner before starting. */
  readonly sizeBytes: number;
  /** License the model ships under, shown next to the download. */
  readonly license: string;
  readonly inputSize: number;
}

/**
 * U²-Net (Apache-2.0): a 320x320 salient-object model that keeps hair and
 * shoulders far better than a colour threshold, and can be redistributed.
 */
export const segmentationModel: ModelAssetSpec = {
  name: "U2-Net salient object",
  url: "https://huggingface.co/tomjackson2023/rembg/resolve/main/u2net.onnx",
  fileName: "u2net.onnx",
  sizeBytes: 176_000_000,
  license: "Apache-2.0",
  inputSize: 320
};

export interface ModelDownloadOptions {
  readonly modelsDirectory: string;
  readonly spec?: ModelAssetSpec;
  readonly fetchImpl?: typeof fetch;
  readonly onProgress?: (fraction: number) => void;
}

export function modelPath(modelsDirectory: string, spec = segmentationModel): string {
  return path.join(modelsDirectory, spec.fileName);
}

export function modelPartPath(modelsDirectory: string, spec = segmentationModel): string {
  return `${modelPath(modelsDirectory, spec)}.part`;
}

export async function isModelInstalled(
  modelsDirectory: string,
  spec = segmentationModel
): Promise<boolean> {
  try {
    const stats = await fs.stat(modelPath(modelsDirectory, spec));
    // A truncated or placeholder file must never be treated as a usable model.
    return stats.size > spec.sizeBytes * 0.5;
  } catch {
    return false;
  }
}

/**
 * Downloads the model once. A file smaller than half the expected size is
 * rejected so a broken CDN response cannot masquerade as a working model.
 */
export async function ensureSegmentationModel(options: ModelDownloadOptions): Promise<string> {
  const spec = options.spec ?? segmentationModel;
  const target = modelPath(options.modelsDirectory, spec);
  if (await isModelInstalled(options.modelsDirectory, spec)) return target;

  const fetchImpl = options.fetchImpl ?? fetch;
  await fs.mkdir(options.modelsDirectory, { recursive: true });
  const partPath = modelPartPath(options.modelsDirectory, spec);
  await fs.rm(partPath, { force: true });

  const response = await fetchImpl(spec.url);
  if (!response.ok || response.body === null) {
    throw new Error(`Could not download the background model (HTTP ${response.status}).`);
  }

  const total = Number(response.headers.get("content-length") ?? spec.sizeBytes);
  const reader = response.body.getReader();
  const handle = await fs.open(partPath, "w");
  let received = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      if (value === undefined) continue;
      await handle.write(value);
      received += value.byteLength;
      if (total > 0) options.onProgress?.(Math.min(1, received / total));
    }
  } finally {
    await handle.close();
  }

  if (received < spec.sizeBytes * 0.5) {
    await fs.rm(partPath, { force: true });
    throw new Error("The background model download was incomplete. Try again.");
  }
  await fs.rename(partPath, target);
  options.onProgress?.(1);
  return target;
}

/** Stable fingerprint of the installed model, used to key expensive results. */
export async function modelFingerprint(modelPathname: string): Promise<string> {
  const handle = await fs.open(modelPathname, "r");
  try {
    const stats = await handle.stat();
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    const readBytes = Math.min(stats.size, buffer.length);
    const { bytesRead } = await handle.read(buffer, 0, readBytes, 0);
    hash.update(buffer.subarray(0, bytesRead));
    return `${stats.size}-${hash.digest("hex").slice(0, 16)}`;
  } finally {
    await handle.close();
  }
}
