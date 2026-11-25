/**
 * Local B-roll image generation (S13, T10, S21).
 *
 * The app already ships transformers.js, which carries the CLIP tokenizer, the
 * text encoder, the UNet loop with its scheduler and the VAE decoder, so this
 * module orchestrates a text-to-image pipeline instead of re-implementing one.
 *
 * The pipeline needs a model that is hundreds of megabytes and touches the disk,
 * so it is only ever created when the caller says the asset is present, and the
 * dependency is injected: tests exercise the orchestration without downloading
 * anything.
 *
 * A diffusion run takes minutes, so every call accepts an abort signal and can
 * share a pipeline pool. Callers that must not block a chat go through the job
 * registry in `broll-import.ts`; nothing here waits on the event loop.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export interface GeneratedImage {
  readonly filePath: string;
  readonly prompt: string;
}

/** Minimal shape of the transformers.js text-to-image pipeline. */
export interface TextToImagePipeline {
  (prompt: string, options?: { numInferenceSteps?: number; guidanceScale?: number }): Promise<
    { toBuffer?: () => Promise<Buffer> } | { data?: Uint8Array } | Array<unknown>
  >;
  dispose?: () => Promise<void> | void;
}

/** Raised when the owner stops a generation instead of waiting for it. */
export class ImageGenerationAbortedError extends Error {
  constructor(readonly reason: string = "Image generation was stopped.") {
    super(reason);
    this.name = "ImageGenerationAbortedError";
  }
}

/**
 * Pipelines are expensive to load (one to four steps per image, but hundreds of
 * megabytes of weights), so several prompts share one. `dispose` releases the
 * model; a pipeline still generating is released as soon as that call returns.
 */
export interface ImagePipelinePool {
  acquire(model: string): Promise<TextToImagePipeline>;
  release(model: string): Promise<void>;
  dispose(model?: string): Promise<void>;
}

interface PipelinePoolEntry {
  readonly created: Promise<TextToImagePipeline>;
  active: number;
  discardWhenIdle: boolean;
}

export function createImagePipelinePool(
  create: (model: string) => Promise<TextToImagePipeline>
): ImagePipelinePool {
  const entries = new Map<string, PipelinePoolEntry>();

  const discard = async (model: string, entry: PipelinePoolEntry): Promise<void> => {
    if (entries.get(model) === entry) entries.delete(model);
    try {
      const pipe = await entry.created;
      await pipe.dispose?.();
    } catch {
      // A pipeline that never loaded has nothing to release.
    }
  };

  return {
    async acquire(model) {
      let entry = entries.get(model);
      if (!entry) {
        const created = create(model);
        // A failed load is reported to the acquirer; keep it from also
        // surfacing as an unhandled rejection.
        created.catch(() => undefined);
        entry = { created, active: 0, discardWhenIdle: false };
        entries.set(model, entry);
      }
      entry.active += 1;
      try {
        return await entry.created;
      } catch (error) {
        entry.active -= 1;
        if (entry.active === 0 && entries.get(model) === entry) entries.delete(model);
        throw error;
      }
    },

    async release(model) {
      const entry = entries.get(model);
      if (!entry) return;
      entry.active = Math.max(0, entry.active - 1);
      if (entry.discardWhenIdle && entry.active === 0) await discard(model, entry);
    },

    async dispose(model) {
      const targets = model === undefined
        ? [...entries.keys()]
        : entries.has(model) ? [model] : [];
      await Promise.all(targets.map(async (key) => {
        const entry = entries.get(key);
        if (!entry) return;
        entry.discardWhenIdle = true;
        if (entry.active === 0) await discard(key, entry);
      }));
    }
  };
}

export interface GenerateImageInput {
  readonly prompt: string;
  readonly outputDirectory: string;
  /** Model id or local directory the pipeline loads. */
  readonly model: string;
  readonly steps?: number;
  /** Injected so tests never load a real model. */
  readonly createPipeline?: (model: string) => Promise<TextToImagePipeline>;
  /** Shared pipeline pool; without one the model is loaded and released per call. */
  readonly pool?: ImagePipelinePool;
  /** Stop waiting as soon as the owner cancels. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
}

const defaultSteps = 4;

/** Deterministic, filesystem-safe name for a prompt. */
export function imageFileName(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  const digest = createHash("sha256").update(prompt).digest("hex").slice(0, 8);
  return `broll-${slug.length > 0 ? slug : "image"}-${digest}.png`;
}

/** Reads a property TypeScript does not declare on the model output. */
function readProperty(source: unknown, key: string): unknown {
  return source !== null && typeof source === "object" ? Reflect.get(source, key) : undefined;
}

/** Normalizes whatever a tensor/raw result resolves to into a PNG buffer. */
async function readBuffer(result: unknown): Promise<Buffer | null> {
  const awaited: unknown = await result;
  if (Buffer.isBuffer(awaited)) return awaited;
  if (awaited instanceof Uint8Array) return Buffer.from(awaited);
  return null;
}

function firstBuffer(output: Awaited<ReturnType<TextToImagePipeline>>): Buffer | null {
  const candidate = Array.isArray(output) ? output[0] : output;
  if (candidate && typeof candidate === "object" && "toBuffer" in candidate) {
    return null;
  }
  if (candidate instanceof Uint8Array) return Buffer.from(candidate);
  const data = readProperty(candidate, "data");
  return data instanceof Uint8Array ? Buffer.from(data) : null;
}

export function throwIfStopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImageGenerationAbortedError();
}

/**
 * Settles with the work or with the cancellation, whichever comes first, so a
 * stopped generation never keeps a chat waiting for the model to unwind.
 */
function waitUntilStopped<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(new ImageGenerationAbortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new ImageGenerationAbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

/**
 * Generates one image and writes it as a PNG. Everything that can fail without
 * the model is validated first, so a missing asset reads as "the model is not
 * installed" instead of a stack trace from deep inside the pipeline.
 */
export async function generateLocalImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new Error("Write a longer description before generating an image.");
  throwIfStopped(input.signal);

  const pool = input.pool
    ?? createImagePipelinePool(input.createPipeline ?? loadTextToImagePipeline);
  const ownsPool = input.pool === undefined;

  try {
    input.onProgress?.("Loading the local image model.");
    const pipe = await waitUntilStopped(pool.acquire(input.model), input.signal);
    try {
      throwIfStopped(input.signal);
      input.onProgress?.(`Generating an image for "${prompt}".`);
      const output = await waitUntilStopped(
        pipe(prompt, { numInferenceSteps: input.steps ?? defaultSteps, guidanceScale: 1 }),
        input.signal
      );
      const first: unknown = Array.isArray(output) ? output[0] : output;
      const toBuffer = readProperty(first, "toBuffer");
      const buffer =
        typeof toBuffer === "function"
          ? await readBuffer(Reflect.apply(toBuffer, first, []) as unknown)
          : firstBuffer(output);
      if (!buffer || buffer.length === 0) {
        throw new Error("The image model returned no picture.");
      }
      // A cancelled request must not leave a picture behind.
      throwIfStopped(input.signal);

      await fs.mkdir(input.outputDirectory, { recursive: true });
      const filePath = path.join(input.outputDirectory, imageFileName(prompt));
      await fs.writeFile(filePath, buffer);
      input.onProgress?.("Image ready.");
      return { filePath, prompt };
    } finally {
      await pool.release(input.model);
    }
  } finally {
    if (ownsPool) await pool.dispose();
  }
}

/** Loads the real pipeline on demand so importing this module stays cheap. */
export async function loadTextToImagePipeline(model: string): Promise<TextToImagePipeline> {
  const transformers = await import("@huggingface/transformers");
  // The bundled types do not list every task the runtime supports; the call is
  // the documented transformers.js one for bundled text-to-image models.
  const pipe = await createTextToImagePipeline(transformers.pipeline, model);
  if (!isTextToImagePipeline(pipe)) {
    throw new Error("The image runtime did not return a text-to-image pipeline.");
  }
  return pipe;
}

/** Structural guard for the two members this module relies on. */
function isTextToImagePipeline(value: unknown): value is TextToImagePipeline {
  if (typeof value !== "function") return false;
  const dispose = Reflect.get(value, "dispose");
  return dispose === undefined || typeof dispose === "function";
}

/** Calls the runtime factory without asserting its untyped signature. */
async function createTextToImagePipeline(
  factory: unknown,
  model: string
): Promise<unknown> {
  if (typeof factory !== "function") {
    throw new Error("The image runtime exposes no pipeline factory.");
  }
  return Reflect.apply(factory, undefined, ["text-to-image", model, { dtype: "q8" }]);
}
