import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateLocalImage, createImagePipelinePool, imageFileName } from "../src/main/image-generation";

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-image-"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const sleep = async (milliseconds: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, milliseconds));

const fakePipeline = (bytes: Uint8Array) => async () => {
  const pipe = (async () => ({ toBuffer: async () => Buffer.from(bytes) })) as never;
  return pipe;
};

describe("local image generation", () => {
  it("writes the generated picture as a PNG named after the prompt", async () => {
    const result = await generateLocalImage({
      prompt: "A clean desk with a laptop and a coffee cup",
      outputDirectory: directory,
      model: "fake/model",
      createPipeline: fakePipeline(new Uint8Array([137, 80, 78, 71]))
    });

    expect(path.basename(result.filePath)).toMatch(/^broll-a-clean-desk.*\.png$/u);
    const written = await fs.readFile(result.filePath);
    expect([...written]).toEqual([137, 80, 78, 71]);
  });

  it("reports progress without exposing the model call", async () => {
    const messages: string[] = [];
    await generateLocalImage({
      prompt: "Mountains at sunrise",
      outputDirectory: directory,
      model: "fake/model",
      createPipeline: fakePipeline(new Uint8Array([1, 2, 3])),
      onProgress: (message) => messages.push(message)
    });

    expect(messages[0]).toContain("Loading");
    expect(messages.at(-1)).toBe("Image ready.");
  });

  it("treats an empty model response as a failure instead of saving a broken file", async () => {
    await expect(
      generateLocalImage({
        prompt: "Something meaningful",
        outputDirectory: directory,
        model: "fake/model",
        createPipeline: fakePipeline(new Uint8Array())
      })
    ).rejects.toThrow(/no picture/);
  });

  it("requires a real description", async () => {
    await expect(
      generateLocalImage({ prompt: "  a ", outputDirectory: directory, model: "m" })
    ).rejects.toThrow(/longer description/);
  });

  it("builds stable, collision-free file names", () => {
    expect(imageFileName("Same prompt")).toBe(imageFileName("Same prompt"));
    expect(imageFileName("Same prompt")).not.toBe(imageFileName("Another prompt"));
    expect(imageFileName("!!!")).toMatch(/^broll-image-[0-9a-f]{8}\.png$/u);
  });
});

describe("local image generation lifecycle", () => {
  it("releases the pipeline of a single generation", async () => {
    let created = 0;
    let disposed = 0;
    await generateLocalImage({
      prompt: "A quiet studio desk",
      outputDirectory: directory,
      model: "fake/model",
      createPipeline: async () => {
        created += 1;
        return Object.assign(async () => ({ toBuffer: async () => Buffer.from([1]) }), {
          dispose: () => {
            disposed += 1;
          }
        }) as never;
      }
    });

    expect(created).toBe(1);
    expect(disposed).toBe(1);
  });

  it("loads a pooled model once and reuses it across prompts", async () => {
    let created = 0;
    let disposed = 0;
    const pool = createImagePipelinePool(async () => {
      created += 1;
      return Object.assign(async () => ({ toBuffer: async () => Buffer.from([1]) }), {
        dispose: () => {
          disposed += 1;
        }
      }) as never;
    });

    for (const prompt of ["A quiet studio desk", "A timeline on screen"]) {
      await generateLocalImage({
        prompt,
        outputDirectory: directory,
        model: "fake/model",
        pool
      });
    }
    expect(created).toBe(1);
    expect(disposed).toBe(0);

    await pool.dispose();
    expect(disposed).toBe(1);
  });

  it("stops waiting as soon as the caller cancels", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const pending = generateLocalImage({
      prompt: "A slow sample",
      outputDirectory: directory,
      model: "fake/model",
      createPipeline: async () =>
        Object.assign(async () => {
          await sleep(3_000);
          return { toBuffer: async () => Buffer.from([1]) };
        }, { dispose: () => undefined }) as never,
      signal: controller.signal
    });

    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow(/was stopped/u);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await expect(fs.readdir(directory)).resolves.toHaveLength(0);
  });

  it("refuses to start when the caller already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let created = 0;
    await expect(
      generateLocalImage({
        prompt: "A quiet studio desk",
        outputDirectory: directory,
        model: "fake/model",
        createPipeline: async () => {
          created += 1;
          return fakePipeline(new Uint8Array([1]))();
        },
        signal: controller.signal
      })
    ).rejects.toThrow(/was stopped/u);
    expect(created).toBe(0);
    expect(await fs.readdir(directory)).toHaveLength(0);
  });
});
