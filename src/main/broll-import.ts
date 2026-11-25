/**
 * B-roll cutaways from images the owner already has (S10), and local generation
 * of those images as a background job (S13, S21).
 *
 * Importing stays small: this takes image files, copies them into the project,
 * and plans the cutaways so they appear at the moments the owner is talking
 * about them. The recording is never destroyed — the cover clip is split around
 * each cutaway and the rest of the timeline is untouched.
 *
 * Generation takes minutes and loads a large model, so a chat never waits on it:
 * `startBrollGeneration` validates the project revision, returns a job at once,
 * and the owner polls it. Errors, cancellations and a deadline settle the job
 * immediately and leave the project file untouched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readEditorDocument, saveEditorDocument } from "./editor-document-store";
import { importsDirectoryName } from "./project-paths";
import {
  planBrollCutaways,
  planBrollMomentSlots,
  type BrollCutawayRequest
} from "../shared/editor-domain/broll-cutaways";
import type { EditorProjectImport } from "../shared/types";
import {
  createImagePipelinePool,
  generateLocalImage,
  loadTextToImagePipeline,
  throwIfStopped,
  type ImagePipelinePool,
  type TextToImagePipeline
} from "./image-generation";

const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

/** A generation with no visible progress for this long is treated as stuck. */
export const defaultBrollGenerationTimeoutMs = 10 * 60 * 1_000;

export interface BrollMoment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface ImageGenerationProgress {
  readonly message: string;
  /** 0–100, monotonic for one job. */
  readonly progress: number;
}

export interface InsertBrollInput {
  readonly rootPath: string;
  readonly baseRevision: number;
  /** Absolute paths of the images to use. */
  readonly imagePaths?: readonly string[];
  /** Transcript moments; when present the cutaways are placed on them. */
  readonly moments?: readonly BrollMoment[];
  readonly maxCutaways?: number;
  readonly summary?: string;
  /** When present, the images are generated locally instead of being supplied. */
  readonly generate?: {
    readonly prompts: readonly string[];
    readonly model: string;
    readonly outputDirectory: string;
    readonly createPipeline?: (model: string) => Promise<TextToImagePipeline>;
    /** Shared pool; without one the model is loaded and released per call. */
    readonly pool?: ImagePipelinePool;
  };
  /** Stops waiting for generated images; nothing is written to the project. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (update: ImageGenerationProgress) => void;
}

export interface InsertBrollResult {
  readonly revision: number;
  readonly cutaways: readonly BrollCutawayRequest[];
  readonly importedCount: number;
}

export type BrollGenerationStatus = "queued" | "generating" | "complete" | "error" | "cancelled";

export interface BrollGenerationJob {
  readonly jobId: string;
  readonly projectId?: string;
  readonly status: BrollGenerationStatus;
  readonly progress: number;
  readonly message: string;
  readonly result?: InsertBrollResult;
  readonly error?: string;
}

export interface StartBrollGenerationInput {
  readonly rootPath: string;
  readonly baseRevision: number;
  readonly projectId?: string;
  readonly imagePaths?: readonly string[];
  readonly moments?: readonly BrollMoment[];
  readonly maxCutaways?: number;
  readonly summary?: string;
  readonly generate: {
    readonly prompts: readonly string[];
    readonly model: string;
    readonly outputDirectory: string;
    readonly createPipeline?: (model: string) => Promise<TextToImagePipeline>;
    /** Bounded by default; a stuck pipeline cannot hold a job open forever. */
    readonly timeoutMs?: number;
  };
}

function extensionOf(filePath: string): string {
  return path.extname(filePath).replace(/^\./u, "").toLowerCase();
}

/** Copies the images the owner pointed at into the project's imports folder. */
async function importImages(
  rootPath: string,
  imagePaths: readonly string[]
): Promise<{ entries: EditorProjectImport[]; itemIds: string[] }> {
  const entries: EditorProjectImport[] = [];
  const itemIds: string[] = [];

  for (const sourcePath of imagePaths) {
    const extension = extensionOf(sourcePath);
    if (!allowedExtensions.has(extension)) {
      throw new Error(`"${path.basename(sourcePath)}" is not an image this project can use.`);
    }
    const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) {
      throw new Error(`"${path.basename(sourcePath)}" is not a readable file.`);
    }

    const id = randomUUID();
    const relativePath = path.posix.join(importsDirectoryName, `${id}.${extension}`);
    const targetPath = path.join(rootPath, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);

    entries.push({
      id,
      name: path.basename(sourcePath),
      kind: "image",
      extension,
      duration: null,
      relativePath
    });
    itemIds.push(id);
  }

  return { entries, itemIds };
}

/** Reads the project and refuses a revision the caller no longer owns. */
async function assertCurrentRevision(rootPath: string, baseRevision: number): Promise<void> {
  const document = await readEditorDocument(rootPath);
  if (!document) throw new Error("This project has no saved editor state yet.");
  if (document.revision !== baseRevision) {
    throw new Error(
      `The project changed since revision ${baseRevision} (now ${document.revision}). Re-read it and retry.`
    );
  }
}

/**
 * Imports the images and applies the cutaway plan. Refuses when the revision
 * moved, so an AI edit never overwrites work the owner just did.
 */
export async function insertBrollCutaways(input: InsertBrollInput): Promise<InsertBrollResult> {
  const generate = input.generate;
  const wantsGeneration = generate !== undefined && generate.prompts.length > 0;

  // Cheapest check first: a stale project must never pay for model work.
  if (wantsGeneration) await assertCurrentRevision(input.rootPath, input.baseRevision);

  // The prompt-based path generates the pictures first, then hands their paths
  // to the same cutaway planning the imported images use.
  const imagePaths = wantsGeneration
    ? await generateImages(generate, { signal: input.signal, onProgress: input.onProgress })
    : input.imagePaths ?? [];
  if (imagePaths.length === 0) throw new Error("No images were provided.");
  throwIfStopped(input.signal);

  const document = await readEditorDocument(input.rootPath);
  if (!document) throw new Error("This project has no saved editor state yet.");
  if (document.revision !== input.baseRevision) {
    throw new Error(
      `The project changed since revision ${input.baseRevision} (now ${document.revision}). Re-read it and retry.`
    );
  }

  const { entries, itemIds } = await importImages(input.rootPath, imagePaths);
  if (itemIds.length === 0) throw new Error("None of the provided images could be imported.");

  const timelineEnd = document.state.timelineSegments.reduce(
    (maximum, segment) => Math.max(maximum, segment.end),
    0
  );
  const cutaways = input.moments && input.moments.length > 0
    ? planBrollMomentSlots(input.moments, itemIds, { maxCutaways: input.maxCutaways })
    : planBrollMomentSlots(
        document.state.subtitles.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
        itemIds,
        { maxCutaways: input.maxCutaways }
      );

  const usable = cutaways.filter((cutaway) => cutaway.start < timelineEnd);
  if (usable.length === 0) throw new Error("There was no moment on the timeline to place an image.");

  const nextSegments = planBrollCutaways(document.state.timelineSegments, usable);
  // Re-check right before saving: a cancelled or superseded job must not write.
  throwIfStopped(input.signal);
  const saved = await saveEditorDocument({
    rootPath: input.rootPath,
    baseRevision: document.revision,
    state: { ...document.state, timelineSegments: nextSegments },
    imports: [...document.imports, ...entries],
    source: "agent",
    summary: input.summary ?? `Added ${usable.length} b-roll cutaway${usable.length === 1 ? "" : "s"}.`,
    checkpoint: true
  });

  return {
    revision: saved.revision,
    cutaways: usable,
    importedCount: entries.length
  };
}

/** Generates every prompt locally and returns the written file paths. */
async function generateImages(
  request: NonNullable<InsertBrollInput["generate"]>,
  options: Pick<InsertBrollInput, "signal" | "onProgress"> = {}
): Promise<string[]> {
  const pool = request.pool
    ?? createImagePipelinePool(request.createPipeline ?? loadTextToImagePipeline);
  const ownsPool = request.pool === undefined;
  const total = request.prompts.length;
  const paths: string[] = [];

  try {
    for (const [index, prompt] of request.prompts.entries()) {
      throwIfStopped(options.signal);
      options.onProgress?.({
        message: `Generating image ${index + 1} of ${total}.`,
        progress: 15 + Math.round((index / total) * 70)
      });
      const image = await generateLocalImage({
        prompt,
        outputDirectory: request.outputDirectory,
        model: request.model,
        pool,
        signal: options.signal
      });
      paths.push(image.filePath);
    }
    options.onProgress?.({ message: "Placing the generated images on the timeline.", progress: 90 });
    return paths;
  } finally {
    if (ownsPool) await pool.dispose();
  }
}

interface BrollJobRecord {
  readonly job: {
    jobId: string;
    projectId?: string;
    status: BrollGenerationStatus;
    progress: number;
    message: string;
    result?: InsertBrollResult;
    error?: string;
  };
  readonly controller: AbortController;
  readonly pool: ImagePipelinePool;
  timer?: NodeJS.Timeout;
  timedOut: boolean;
  settled: boolean;
}

const jobs = new Map<string, BrollJobRecord>();
/** Bounded history: settled jobs stay readable, the oldest ones are dropped. */
const maximumRetainedJobs = 32;

function settle(record: BrollJobRecord): boolean {
  if (record.settled) return false;
  record.settled = true;
  if (record.timer) clearTimeout(record.timer);
  record.timer = undefined;
  return true;
}

/** Keeps the settled history bounded without ever dropping the newest job. */
function pruneSettledJobs(reserve: number): void {
  for (const [jobId, record] of jobs) {
    if (jobs.size + reserve <= maximumRetainedJobs) return;
    if (record.settled) jobs.delete(jobId);
  }
}

function snapshot(record: BrollJobRecord): BrollGenerationJob {
  return structuredClone({ ...record.job });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deadlineMessage(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / 60_000);
  const seconds = Math.max(1, Math.round(timeoutMs / 1_000));
  const amount = minutes >= 1
    ? `${minutes} minute${minutes === 1 ? "" : "s"}`
    : `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `Image generation did not finish within ${amount} and was stopped. Try fewer images or a shorter request.`;
}

/**
 * Starts a generation job and returns at once. The expensive work — loading the
 * model, running the pipeline, importing and planning the cutaways — continues
 * in the background so the chat keeps answering.
 */
export async function startBrollGeneration(
  input: StartBrollGenerationInput
): Promise<BrollGenerationJob> {
  const prompts = input.generate.prompts.map((prompt) => prompt.trim()).filter((prompt) => prompt.length > 0);
  if (prompts.length === 0) throw new Error("Write at least one image description before generating.");
  // Fail before any model work when the project moved under the assistant.
  await assertCurrentRevision(input.rootPath, input.baseRevision);

  const timeoutMs = input.generate.timeoutMs ?? defaultBrollGenerationTimeoutMs;
  const pool = createImagePipelinePool(input.generate.createPipeline ?? loadTextToImagePipeline);
  const controller = new AbortController();
  const record: BrollJobRecord = {
    job: {
      jobId: randomUUID(),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      status: "queued",
      progress: 0,
      message: "Image generation queued."
    },
    controller,
    pool,
    timedOut: false,
    settled: false
  };
  pruneSettledJobs(1);
  jobs.set(record.job.jobId, record);
  record.timer = setTimeout(() => {
    record.timedOut = true;
    controller.abort();
    void pool.dispose();
    if (settle(record)) {
      record.job.status = "error";
      record.job.message = deadlineMessage(timeoutMs);
      record.job.error = record.job.message;
    }
  }, timeoutMs);
  // A finished job needs no timer to fire, and the process must not be held open.
  record.timer.unref?.();

  void runBrollGeneration(record, { ...input, generate: { ...input.generate, prompts } })
    .catch(() => undefined);
  return snapshot(record);
}

async function runBrollGeneration(
  record: BrollJobRecord,
  input: StartBrollGenerationInput
): Promise<void> {
  try {
    record.job.status = "generating";
    record.job.progress = 10;
    record.job.message = "Generating the images locally.";
    const result = await insertBrollCutaways({
      rootPath: input.rootPath,
      baseRevision: input.baseRevision,
      imagePaths: input.imagePaths ?? [],
      ...(input.moments === undefined ? {} : { moments: input.moments }),
      ...(input.maxCutaways === undefined ? {} : { maxCutaways: input.maxCutaways }),
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      generate: {
        prompts: input.generate.prompts,
        model: input.generate.model,
        outputDirectory: input.generate.outputDirectory,
        pool: record.pool
      },
      signal: record.controller.signal,
      onProgress: (update) => {
        if (record.settled) return;
        record.job.progress = Math.max(record.job.progress, Math.min(99, update.progress));
        record.job.message = update.message;
      }
    });
    if (settle(record)) {
      record.job.status = "complete";
      record.job.progress = 100;
      record.job.message =
        `Added ${result.cutaways.length} b-roll cutaway${result.cutaways.length === 1 ? "" : "s"}.`;
      record.job.result = result;
    }
  } catch (error) {
    if (settle(record)) {
      if (record.timedOut) {
        record.job.status = "error";
        record.job.message = deadlineMessage(input.generate.timeoutMs ?? defaultBrollGenerationTimeoutMs);
        record.job.error = record.job.message;
      } else if (record.controller.signal.aborted) {
        record.job.status = "cancelled";
        record.job.message = "Image generation was cancelled.";
      } else {
        record.job.status = "error";
        record.job.message = messageOf(error);
        record.job.error = messageOf(error);
      }
    }
  } finally {
    if (record.timer) clearTimeout(record.timer);
    record.timer = undefined;
    // Release the model whatever happened: cancelled and failed runs included.
    await record.pool.dispose().catch(() => undefined);
  }
}

/** Reads a job so the assistant can report progress or the final result. */
export function getBrollGenerationJob(jobId: string): BrollGenerationJob | null {
  const record = jobs.get(jobId);
  return record ? snapshot(record) : null;
}

/** Stops a running job at once; the project file is never touched afterwards. */
export function cancelBrollGenerationJob(jobId: string): BrollGenerationJob | null {
  const record = jobs.get(jobId);
  if (!record) return null;
  if (settle(record)) {
    record.job.status = "cancelled";
    record.job.message = "Image generation was cancelled.";
    record.controller.abort();
    void record.pool.dispose();
  }
  return snapshot(record);
}
