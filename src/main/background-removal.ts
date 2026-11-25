/**
 * Lifecycle of the one-time webcam matte (S9).
 *
 * One job per project, reported through the same progress channel the UI already
 * uses for long work. The result is written next to the project so every later
 * preview and export reuses it instead of inferring again.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureSegmentationModel, isModelInstalled, modelPath } from "./background-model";
import { MatteCancelledError, renderCameraMatte } from "./camera-matte-job";
import { mediaTrackRelativePaths } from "./project-paths";
import type { BackgroundRemovalStatus } from "../shared/types";

export const cameraMatteRelativePath = ".ovc/camera-mask.webm";
const markerRelativePath = ".ovc/camera-matte.json";

export interface BackgroundRemovalDeps {
  readonly modelsDirectory: string;
  readonly onProgress?: (status: BackgroundRemovalStatus) => void;
}

interface JobState {
  status: "idle" | "downloading-model" | "processing" | "done" | "error" | "cancelled";
  progress: number;
  message: string | null;
  signal: { cancelled: boolean };
}

const jobs = new Map<string, JobState>();

export function getBackgroundRemovalStatus(projectId: string): BackgroundRemovalStatus {
  const job = jobs.get(projectId);
  return {
    status: job?.status ?? "idle",
    progress: job?.progress ?? 0,
    message: job?.message ?? null
  };
}

/** True when a completed matte exists for the project. */
export async function hasCameraMatte(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, cameraMatteRelativePath));
    return true;
  } catch {
    return false;
  }
}

export async function cancelBackgroundRemoval(projectId: string): Promise<boolean> {
  const job = jobs.get(projectId);
  if (!job || job.status === "done" || job.status === "error") return false;
  job.signal.cancelled = true;
  job.status = "cancelled";
  job.message = "Background removal cancelled.";
  return true;
}

function report(projectId: string, deps: BackgroundRemovalDeps): void {
  deps.onProgress?.(getBackgroundRemovalStatus(projectId));
}

/**
 * Starts the one-time pass. It resolves when the matte is written, so the caller
 * can await it; the UI keeps showing progress through `onProgress`.
 */
export async function startBackgroundRemoval(input: {
  projectId: string;
  rootPath: string;
  deps: BackgroundRemovalDeps;
}): Promise<BackgroundRemovalStatus> {
  const existing = jobs.get(input.projectId);
  if (existing && (existing.status === "processing" || existing.status === "downloading-model")) {
    return getBackgroundRemovalStatus(input.projectId);
  }

  const state: JobState = {
    status: "downloading-model",
    progress: 0,
    message: "Preparing the background model.",
    signal: { cancelled: false }
  };
  jobs.set(input.projectId, state);
  report(input.projectId, input.deps);

  const setState = (status: JobState["status"], progress: number, message: string | null): void => {
    state.status = status;
    state.progress = progress;
    state.message = message;
    report(input.projectId, input.deps);
  };

  try {
    if (!(await isModelInstalled(input.deps.modelsDirectory))) {
      await ensureSegmentationModel({
        modelsDirectory: input.deps.modelsDirectory,
        onProgress: (fraction) => {
          if (state.signal.cancelled) return;
          setState("downloading-model", fraction, "Downloading the background model.");
        }
      });
    }

    setState("processing", 0, "Removing the webcam background frame by frame.");
    const sourcePath = path.join(input.rootPath, mediaTrackRelativePaths.camera);
    const outputPath = path.join(input.rootPath, cameraMatteRelativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const result = await renderCameraMatte({
      sourcePath,
      outputPath,
      modelPath: modelPath(input.deps.modelsDirectory),
      signal: state.signal,
      onProgress: (fraction) => {
        if (state.signal.cancelled) return;
        setState("processing", fraction, "Removing the webcam background frame by frame.");
      }
    });

    await fs.writeFile(
      path.join(input.rootPath, markerRelativePath),
      JSON.stringify({ frames: result.frames, createdAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    setState("done", 1, `Webcam matte ready (${result.frames} frames).`);
    return getBackgroundRemovalStatus(input.projectId);
  } catch (error) {
    if (error instanceof MatteCancelledError) {
      setState("cancelled", state.progress, "Background removal cancelled.");
      return getBackgroundRemovalStatus(input.projectId);
    }
    setState("error", state.progress, error instanceof Error ? error.message : String(error));
    return getBackgroundRemovalStatus(input.projectId);
  }
}
