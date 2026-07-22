/**
 * Editor "Export video" flow: pick a destination, resolve the source media and
 * per-track gains, run the ffmpeg export, and drop an optional `.srt` sidecar.
 *
 * All app state the flow needs (the project store, the imported-media path
 * cache, and the dialog parent window) is passed in as an explicit context so
 * this module stays decoupled from the main-process globals.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import type { BrowserWindow } from "electron";
import {
  chooseExportPath as showExportPathDialog,
  type SecurityScopedBookmarkHandler
} from "./file-dialogs";
import { exportVideo } from "./ffmpeg";
import { exportEditorProjectToPath } from "./composition-export";
import type { ProjectStore } from "./project-store";
import type { ExportJobControl } from "./export-jobs";
import {
  SubtitleSidecarExistsError,
  writeSubtitleSidecar,
  writeTemporarySubtitleSidecar
} from "./subtitle-export";
import type { ExportVideoRequest, ExportVideoResult } from "../shared/types";

export interface EditorExportContext {
  projectStore: ProjectStore;
  importedMediaCache: Map<string, string>;
  getDialogParentWindow: () => BrowserWindow | null;
  activateSecurityScopedResource?: SecurityScopedBookmarkHandler;
  control?: ExportJobControl;
}

type ExportSource = {
  name: string;
  videoPath: string;
  audioTracks: Array<{ id: string; path: string }>;
  preserveSourceAudio: boolean;
};

export async function exportEditorVideo(
  request: ExportVideoRequest,
  context: EditorExportContext
): Promise<ExportVideoResult | null> {
  const source = resolveExportSource(request, context);
  const outputPath = await showExportPathDialog(context.getDialogParentWindow(), {
    format: request.format,
    name: source.name
  }, context.activateSecurityScopedResource);

  if (!outputPath) {
    return null;
  }

  try {
    const result = await exportEditorVideoToPath(request, context, source, outputPath);
    context.control?.onProgress(100, "Export complete.");
    return result;
  } catch (error) {
    // Sidecar creation is exclusive and happens before rendering or encoding.
    // If it reports a collision, FFmpeg has not touched the selected video path;
    // deleting it here could erase an existing export the user chose to replace.
    if (!(error instanceof SubtitleSidecarExistsError)) {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

async function exportEditorVideoToPath(
  request: ExportVideoRequest,
  context: EditorExportContext,
  source: ExportSource,
  outputPath: string
): Promise<ExportVideoResult> {
  if (request.source.kind === "project") {
    const document = await context.projectStore.readEditorState(request.source.projectId);
    if (document?.state.timelineSegments.some((segment) => segment.track === "video")) {
      const project = context.projectStore.getProject(request.source.projectId);
      return exportEditorProjectToPath({
        rootPath: project.rootPath,
        project,
        document,
        outputPath,
        format: request.format,
        resolution: request.resolution,
        subtitleMode: request.subtitleMode ?? "burn-in",
        trimStart: request.trimStart,
        trimEnd: request.trimEnd,
        control: context.control
      });
    }
  }

  const subtitleMode = request.subtitleMode ?? "burn-in";
  const temporarySubtitles = subtitleMode === "burn-in"
    ? await writeTemporarySubtitleSidecar(request)
    : null;
  const subtitlePath = subtitleMode === "sidecar"
    ? await writeSubtitleSidecar(outputPath, request)
    : null;
  let bytesWritten: number;
  let exportCompleted = false;

  try {
    bytesWritten = await exportVideo({
      videoPath: source.videoPath,
      audioTracks: [
        ...source.audioTracks.map((track) => ({
          path: track.path,
          volume: request.volume * getRequestedAudioGain(request, track.id)
        })),
        ...request.backgroundAudioImportIds.map((id) => ({
          path: resolveImportedMediaPath(id, context),
          volume: request.volume * getRequestedAudioGain(request, id)
        }))
      ],
      outputPath,
      format: request.format,
      resolution: request.resolution,
      trimStart: Math.max(0, request.trimStart),
      trimEnd:
        request.trimEnd && request.trimEnd > request.trimStart ? request.trimEnd : null,
      sourceAudioVolume: request.volume,
      preserveSourceAudio: source.preserveSourceAudio,
      subtitlePath: subtitleMode === "burn-in" ? temporarySubtitles?.path ?? null : null
    }, context.control);
    exportCompleted = true;
  } finally {
    await temporarySubtitles?.cleanup().catch(() => undefined);
    if (subtitlePath && !exportCompleted) {
      await fs.rm(subtitlePath, { force: true }).catch(() => undefined);
    }
  }

  return {
    path: outputPath,
    bytesWritten,
    subtitlePath: subtitleMode === "sidecar" ? subtitlePath : null
  };
}

function resolveExportSource(
  request: ExportVideoRequest,
  context: EditorExportContext
): ExportSource {
  if (request.source.kind === "import") {
    return {
      name: path.basename(resolveImportedMediaPath(request.source.importId, context)),
      videoPath: resolveImportedMediaPath(request.source.importId, context),
      audioTracks: [],
      preserveSourceAudio: true
    };
  }

  const { projectStore } = context;
  const project = projectStore.getProject(request.source.projectId);
  const screenPath = projectStore.getMediaPath(request.source.projectId, "screen");

  if (!screenPath) {
    throw new Error("This project does not have a screen recording to export.");
  }

  const micPath =
    projectStore.getMediaPath(request.source.projectId, "micWav") ??
    projectStore.getMediaPath(request.source.projectId, "micWebm");
  const systemPath =
    projectStore.getMediaPath(request.source.projectId, "systemWav") ??
    projectStore.getMediaPath(request.source.projectId, "systemWebm");

  return {
    name: project.name,
    videoPath: screenPath,
    audioTracks: [
      ...(micPath ? [{ id: `${project.id}:audio`, path: micPath }] : []),
      ...(systemPath ? [{ id: `${project.id}:system-audio`, path: systemPath }] : [])
    ],
    preserveSourceAudio: false
  };
}

function getRequestedAudioGain(request: ExportVideoRequest, itemId: string): number {
  const level = request.audioLevels[itemId];
  if (level?.muted) {
    return 0;
  }
  return Math.max(0, (level?.volume ?? 100) / 100);
}

function resolveImportedMediaPath(importId: string, context: EditorExportContext): string {
  const filePath = context.importedMediaCache.get(importId);

  if (!filePath) {
    throw new Error("Imported media is no longer available in this editing session.");
  }

  return filePath;
}
