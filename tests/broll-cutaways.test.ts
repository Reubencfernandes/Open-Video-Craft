import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cancelBrollGenerationJob,
  getBrollGenerationJob,
  insertBrollCutaways,
  startBrollGeneration,
  type BrollGenerationJob
} from "../src/main/broll-import";
import type { TextToImagePipeline } from "../src/main/image-generation";
import { readEditorDocument, saveEditorDocument } from "../src/main/editor-document-store";
import { createDefaultEditorState } from "../src/shared/editor-domain";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-broll-"));
  await fs.mkdir(path.join(root, "media"), { recursive: true });
  await fs.writeFile(path.join(root, "media", "screen.webm"), Buffer.from("fake"));
  await saveEditorDocument({
    rootPath: root,
    baseRevision: 0,
    state: {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "main", itemId: "screen", track: "video", lane: 0, start: 0, end: 20, sourceStart: 0 }
      ],
      subtitles: [
        { id: "s1", start: 4, end: 8, text: "this is where I explain the export settings" },
        { id: "s2", start: 12, end: 16, text: "and here I show the timeline layout" }
      ]
    },
    imports: [],
    source: "editor",
    checkpoint: false
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function imageFile(name: string): Promise<string> {
  const file = path.join(root, `${name}.png`);
  await fs.writeFile(file, Buffer.from("fake-png"));
  return file;
}

const sleep = async (milliseconds: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForJob(jobId: string): Promise<BrollGenerationJob> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = getBrollGenerationJob(jobId);
    if (job && job.status !== "queued" && job.status !== "generating") return job;
    await sleep(10);
  }
  throw new Error(`Job ${jobId} never settled.`);
}

interface FakePipelineOptions {
  /** Time the fake inference spends before it answers. */
  readonly delayMs?: number;
  /** One-based prompt number that fails, to simulate a model error. */
  readonly failOnCall?: number;
  readonly onCreate?: () => void;
  readonly onDispose?: () => void;
  readonly onPrompt?: (prompt: string) => void;
}

/** Injected pipeline factory: no model is loaded and no inference runs. */
function fakePipelineFactory(options: FakePipelineOptions) {
  let calls = 0;
  return async (): Promise<TextToImagePipeline> => {
    options.onCreate?.();
    const call = async (prompt: string): Promise<{ toBuffer: () => Promise<Buffer> }> => {
      calls += 1;
      options.onPrompt?.(prompt);
      if (options.failOnCall === calls) throw new Error("The image model ran out of memory.");
      if (options.delayMs !== undefined) await sleep(options.delayMs);
      return { toBuffer: async () => Buffer.from("fake-png") };
    };
    return Object.assign(call, {
      dispose: () => {
        options.onDispose?.();
      }
    }) as unknown as TextToImagePipeline;
  };
}

function generationRequest(
  prompts: readonly string[],
  options: FakePipelineOptions & { readonly timeoutMs?: number } = {}
) {
  return {
    prompts,
    model: "fake/model",
    outputDirectory: path.join(root, "generated"),
    createPipeline: fakePipelineFactory(options),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  };
}

describe("b-roll cutaways", () => {
  it("splits the recording around each moment and inserts the images", async () => {
    const result = await insertBrollCutaways({
      rootPath: root,
      baseRevision: 1,
      imagePaths: [await imageFile("a"), await imageFile("b")]
    });

    expect(result.importedCount).toBe(2);
    expect(result.cutaways.length).toBeGreaterThan(0);

    const document = await readEditorDocument(root);
    const video = document!.state.timelineSegments.filter((segment) => segment.track === "video");
    const images = video.filter((segment) => document!.imports.some((entry) => entry.id === segment.itemId));
    expect(images.length).toBe(result.cutaways.length);
    // The picture resumes after each image with no gap.
    const ordered = [...video].sort((first, second) => first.start - second.start);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].start).toBeCloseTo(ordered[index - 1].end, 6);
    }
  });

  it("refuses an image that is not an image", async () => {
    const file = path.join(root, "notes.txt");
    await fs.writeFile(file, "hello");
    await expect(
      insertBrollCutaways({ rootPath: root, baseRevision: 1, imagePaths: [file] })
    ).rejects.toThrow(/not an image/);
  });

  it("refuses to overwrite a newer revision", async () => {
    await expect(
      insertBrollCutaways({ rootPath: root, baseRevision: 7, imagePaths: [await imageFile("c")] })
    ).rejects.toThrow(/changed since revision/);
  });
});

describe("generated b-roll", () => {
  it("generates the pictures and then places them as cutaways", async () => {
    const generated: string[] = [];
    const result = await insertBrollCutaways({
      rootPath: root,
      baseRevision: 1,
      imagePaths: [],
      generate: {
        prompts: ["a clean desk", "a timeline on screen"],
        model: "fake/model",
        outputDirectory: path.join(root, "generated"),
        createPipeline: (async () => {
          const pipe = (async (prompt: string) => {
            generated.push(prompt);
            return { toBuffer: async () => Buffer.from("fake-png") };
          }) as never;
          return pipe;
        }) as never
      }
    });

    expect(generated).toEqual(["a clean desk", "a timeline on screen"]);
    expect(result.importedCount).toBe(2);
    const document = await readEditorDocument(root);
    const imageSegments = document!.state.timelineSegments.filter((segment) =>
      document!.imports.some((entry) => entry.id === segment.itemId)
    );
    expect(imageSegments.length).toBeGreaterThan(0);
  });
});

describe("generated b-roll as a background job", () => {
  it("answers before the model finishes so the chat keeps running", async () => {
    const prompts: string[] = [];
    const startedAt = Date.now();
    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk", "a timeline on screen"], {
        delayMs: 120,
        onPrompt: (prompt) => prompts.push(prompt)
      })
    });

    // The tool call returns while the model is still working: nothing blocks the
    // event loop for the whole generation.
    expect(Date.now() - startedAt).toBeLessThan(100);
    expect(job.status).toBe("generating");
    expect(prompts).toHaveLength(0);

    let heartbeats = 0;
    const heartbeat = setInterval(() => {
      heartbeats += 1;
    }, 5);
    await sleep(40);
    expect(heartbeats).toBeGreaterThanOrEqual(3);
    // A poll answers while the job is still running.
    const running = getBrollGenerationJob(job.jobId);
    expect(running?.status).toBe("generating");
    expect(running?.progress).toBeGreaterThanOrEqual(0);

    const done = await waitForJob(job.jobId);
    clearInterval(heartbeat);
    expect(done.status).toBe("complete");
    expect(done.result?.importedCount).toBe(2);
    expect(done.result?.cutaways.length).toBeGreaterThan(0);
    expect(prompts).toEqual(["a clean desk", "a timeline on screen"]);

    const document = await readEditorDocument(root);
    const imageSegments = document!.state.timelineSegments.filter((segment) =>
      document!.imports.some((entry) => entry.id === segment.itemId)
    );
    expect(imageSegments.length).toBe(done.result!.cutaways.length);
  });

  it("loads the model once per request and releases it when the job ends", async () => {
    let created = 0;
    let disposed = 0;
    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk", "a timeline on screen"], {
        delayMs: 5,
        onCreate: () => {
          created += 1;
        },
        onDispose: () => {
          disposed += 1;
        }
      })
    });

    const done = await waitForJob(job.jobId);
    expect(done.status).toBe("complete");
    expect(created).toBe(1);
    await waitFor(() => disposed === 1, "the pipeline to be released");
  });

  it("reports a failed generation and imports nothing", async () => {
    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk", "a timeline on screen"], {
        delayMs: 5,
        failOnCall: 2
      })
    });

    const failed = await waitForJob(job.jobId);
    expect(failed.status).toBe("error");
    expect(failed.error).toContain("ran out of memory");

    const document = await readEditorDocument(root);
    expect(document!.revision).toBe(1);
    expect(document!.imports).toHaveLength(0);
    expect(document!.state.timelineSegments).toHaveLength(1);
  });

  it("recovers on the next request after a failure", async () => {
    const failed = await waitForJob(
      (
        await startBrollGeneration({
          rootPath: root,
          baseRevision: 1,
          generate: generationRequest(["a clean desk"], { delayMs: 5, failOnCall: 1 })
        })
      ).jobId
    );
    expect(failed.status).toBe("error");

    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk"], { delayMs: 5 })
    });
    const done = await waitForJob(job.jobId);
    expect(done.status).toBe("complete");
    expect(done.result?.importedCount).toBe(1);
  });

  it("cancels a running generation promptly and leaves the project untouched", async () => {
    let disposed = 0;
    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk", "a timeline on screen"], {
        delayMs: 250,
        onDispose: () => {
          disposed += 1;
        }
      })
    });

    await sleep(20);
    const cancelled = cancelBrollGenerationJob(job.jobId);
    expect(cancelled?.status).toBe("cancelled");

    let heartbeats = 0;
    const heartbeat = setInterval(() => {
      heartbeats += 1;
    }, 5);
    await sleep(30);
    clearInterval(heartbeat);
    expect(heartbeats).toBeGreaterThanOrEqual(3);

    await waitFor(() => disposed === 1, "the cancelled pipeline to be released");
    expect(getBrollGenerationJob(job.jobId)?.status).toBe("cancelled");
    const document = await readEditorDocument(root);
    expect(document!.revision).toBe(1);
    expect(document!.imports).toHaveLength(0);
  });

  it("stops a generation that runs past its deadline", async () => {
    const job = await startBrollGeneration({
      rootPath: root,
      baseRevision: 1,
      generate: generationRequest(["a clean desk"], { delayMs: 400, timeoutMs: 30 })
    });

    const timedOut = await waitForJob(job.jobId);
    expect(timedOut.status).toBe("error");
    expect(timedOut.message).toMatch(/did not finish within/u);

    const document = await readEditorDocument(root);
    expect(document!.revision).toBe(1);
    expect(document!.imports).toHaveLength(0);
  });

  it("refuses a stale revision before any model work starts", async () => {
    let created = 0;
    await expect(
      startBrollGeneration({
        rootPath: root,
        baseRevision: 9,
        generate: generationRequest(["a clean desk"], {
          onCreate: () => {
            created += 1;
          }
        })
      })
    ).rejects.toThrow(/changed since revision/u);
    expect(created).toBe(0);
  });

  it("reports an unknown job instead of pretending it exists", () => {
    expect(getBrollGenerationJob("missing-job")).toBeNull();
    expect(cancelBrollGenerationJob("missing-job")).toBeNull();
  });
});
