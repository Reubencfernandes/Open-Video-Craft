import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ensureSegmentationModel,
  isModelInstalled,
  modelFingerprint,
  modelPath,
  segmentationModel,
  type SegmentationModelSpec
} from "../src/main/background-model";

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-model-"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const spec: SegmentationModelSpec = {
  ...segmentationModel,
  fileName: "tiny.onnx",
  sizeBytes: 1000,
  url: "https://example.test/tiny.onnx"
};

function fakeFetch(bytes: number, status = 200): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-length": String(bytes) }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      }
    })
  })) as unknown as typeof fetch;
}

describe("background model download", () => {
  it("downloads once and reports progress", async () => {
    const progress: number[] = [];
    const target = await ensureSegmentationModel({
      modelsDirectory: directory,
      spec,
      fetchImpl: fakeFetch(1000),
      onProgress: (fraction) => progress.push(fraction)
    });

    expect(target).toBe(modelPath(directory, spec));
    expect(progress.at(-1)).toBe(1);
    await expect(isModelInstalled(directory, spec)).resolves.toBe(true);
  });

  it("does not download again when the model is already installed", async () => {
    await ensureSegmentationModel({ modelsDirectory: directory, spec, fetchImpl: fakeFetch(1000) });
    let calls = 0;
    await ensureSegmentationModel({
      modelsDirectory: directory,
      spec,
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("should not be called");
      }) as unknown as typeof fetch
    });
    expect(calls).toBe(0);
  });

  it("rejects a truncated download instead of using a broken model", async () => {
    await expect(
      ensureSegmentationModel({ modelsDirectory: directory, spec, fetchImpl: fakeFetch(100) })
    ).rejects.toThrow(/incomplete/);
    await expect(isModelInstalled(directory, spec)).resolves.toBe(false);
  });

  it("surfaces an HTTP failure", async () => {
    await expect(
      ensureSegmentationModel({ modelsDirectory: directory, spec, fetchImpl: fakeFetch(0, 503) })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fingerprints the installed file by size and content", async () => {
    const target = await ensureSegmentationModel({ modelsDirectory: directory, spec, fetchImpl: fakeFetch(1000) });
    const first = await modelFingerprint(target);
    expect(first).toMatch(/^1000-[0-9a-f]{16}$/);
    expect(await modelFingerprint(target)).toBe(first);
  });
});
