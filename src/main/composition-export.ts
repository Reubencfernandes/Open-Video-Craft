/** Pure Node timeline export entry point shared by Electron and the MCP server. */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportTimelineComposition, mediaHasAudio, probeMediaSize } from "./ffmpeg";
import { resolveArnndnModelPath } from "./audio-model-path";
import type {
  ExportProcessControl,
  TimelineCompositionAudioSegment,
  TimelineCompositionCameraLayer,
  TimelineCompositionVideoSegment
} from "./ffmpeg";
import {
  writeSubtitleSidecar,
  writeTemporarySubtitleSidecar
} from "./subtitle-export";
import { resolveContainedProjectPath } from "./project-containment";
import type {
  EditorProjectStateFile,
  ExportResolution,
  ExportSubtitleMode,
  ExportVideoFormat,
  ExportVideoRequest,
  ExportVideoResult,
  ProjectFile
} from "../shared/types";
import {
  buildAudioCleanupFilter,
  getEffectiveAudioLevel,
  validateClipTransitions
} from "../shared/editor-domain";
import type { ClipEdgeTransition, SpeedRate, TextOverlay } from "../shared/editor-domain";
import { screenCropFilter } from "../shared/editor-domain/screen-crop";
import { subtitleForceStyle } from "../shared/editor-domain/subtitle-export-style";
import {
  getCompositionLayout,
  resolveCameraBorder,
  resolveCameraStyle,
  resolveCompositionWindows,
  type CompositionRole
} from "../shared/editor-domain/timeline-visibility";
import type { TimelineSegment } from "../shared/editor-domain/types";
import { getRecordingKindForTrackId } from "../shared/types";

/** Maps clip-edge metadata onto an exported visible range. */
export function resolveEdgeTransitionTiming(
  transitions: readonly ClipEdgeTransition[] | undefined,
  segment: { id: string; start: number; end: number; sourceStart: number },
  windowStart: number,
  windowEnd: number
): { edgeStartSeconds?: number; edgeEndSeconds?: number } {
  const epsilon = 0.0005;
  const edgeAt = (edge: "start" | "end"): number | undefined => {
    const transition = transitions?.find((item) => item.segmentId === segment.id && item.edge === edge);
    if (!transition) return undefined;
    const touchesClip =
      edge === "start"
        ? Math.abs(windowStart - segment.start) <= epsilon
        : Math.abs(windowEnd - segment.end) <= epsilon;
    return touchesClip ? transition.duration : undefined;
  };
  const edgeStartSeconds = edgeAt("start");
  const edgeEndSeconds = edgeAt("end");
  return {
    ...(edgeStartSeconds === undefined ? {} : { edgeStartSeconds }),
    ...(edgeEndSeconds === undefined ? {} : { edgeEndSeconds })
  };
}

export async function exportEditorProjectToPath(input: {
  rootPath: string;
  project: ProjectFile;
  document: EditorProjectStateFile;
  outputPath: string;
  format: ExportVideoFormat;
  resolution: ExportResolution;
  subtitleMode?: ExportSubtitleMode;
  trimStart?: number;
  trimEnd?: number | null;
  control?: ExportProcessControl;
}): Promise<ExportVideoResult> {
  validateClipTransitions(
    input.document.state.timelineSegments,
    input.document.state.transitions ?? []
  );
  const sourceById = new Map<
    string,
    { path: string; kind: "video" | "audio" | "image"; role: CompositionRole }
  >();
  const projectId = input.project.id;
  addProjectSource(sourceById, `${projectId}:screen`, input.rootPath, input.project.tracks.screen, "video", "base");
  addProjectSource(sourceById, `${projectId}:audio`, input.rootPath, input.project.tracks.micWav ?? input.project.tracks.micWebm, "audio", "base");
  addProjectSource(sourceById, `${projectId}:system-audio`, input.rootPath, input.project.tracks.systemWav ?? input.project.tracks.systemWebm, "audio", "base");
  // Every captured screen and webcam track is a real timeline source. Registering
  // them here is what lets a multi-camera project export at all: the camera
  // channels used to be missing and the export refused the clip.
  registerProjectVideoTracks(sourceById, input.rootPath, projectId, input.project.tracks);
  for (const imported of input.document.imports) {
    const absolutePath = resolveContainedProjectPath(input.rootPath, imported.relativePath);
    sourceById.set(imported.id, { path: absolutePath, kind: imported.kind, role: "base" });
  }

  const videoSegments: TimelineCompositionVideoSegment[] = [];
  const audioSegments: TimelineCompositionAudioSegment[] = [];
  const compositionSegments: Array<TimelineSegment & { role: CompositionRole }> = [];
  const videoAudioById = new Map<string, { volume: number; cleanupFilter?: string }>();

  for (const segment of input.document.state.timelineSegments) {
    // A deactivated clip stays on the timeline but never reaches the file.
    if (segment.hidden === true) continue;
    const source = sourceById.get(segment.itemId);
    if (!source) throw new Error(`Timeline media "${segment.itemId}" is unavailable.`);
    const level = getEffectiveAudioLevel(
      input.document.state.audioLevels,
      segment.itemId,
      segment.track === "audio" ? segment.lane : null
    );
    const volume = level.muted
      ? 0
      : Math.max(0, level.volume / 100) * input.document.state.masterVolume / 100;
    const cleanup = input.document.state.audioCleanup?.[segment.itemId];
    const cleanupFilter = cleanup
      ? buildAudioCleanupFilter(cleanup, resolveArnndnModelPath(process.resourcesPath))
      : undefined;
    if (segment.track === "video") {
      if (source.kind === "audio") throw new Error(`Audio item "${segment.itemId}" cannot appear on the video track.`);
      compositionSegments.push({ ...segment, role: source.role });
      videoAudioById.set(segment.id, {
        volume,
        ...(cleanupFilter === undefined ? {} : { cleanupFilter })
      });
    } else {
      audioSegments.push({
        path: source.path, start: segment.start, end: segment.end,
        sourceStart: segment.sourceStart, volume, cleanupFilter,
        fadeIn: level.fadeIn, fadeOut: level.fadeOut,
        speedAffected: false
      });
    }
  }

  // The base picture and the webcam are composed per window, exactly as the
  // canvas resolves them: overlapping channels never concatenate, the webcam
  // stays above the screen, and the layout presets arrange both layers.
  const frameAspect = input.resolution === "vertical" ? 9 / 16 : 16 / 9;
  const needsIntrinsicAspect = input.document.state.screenAspectRatio === "auto";
  const intrinsicAspectByPath = new Map<string, number | null>();
  async function intrinsicAspectOf(filePath: string): Promise<number | null> {
    if (!intrinsicAspectByPath.has(filePath)) {
      const size = await probeMediaSize(filePath);
      intrinsicAspectByPath.set(
        filePath,
        size && size.height > 0 ? size.width / size.height : null
      );
    }
    return intrinsicAspectByPath.get(filePath) ?? null;
  }

  for (const window of resolveCompositionWindows(compositionSegments)) {
    const base = window.base;
    const camera = window.camera;
    const baseSource = base === null ? undefined : sourceById.get(base.itemId);
    const cameraSource = camera === null ? undefined : sourceById.get(camera.itemId);
    // A clip may impose its own layout while it is on screen; the base picture
    // decides first because it is the layer the presets arrange.
    const layoutMode = base?.layout ?? camera?.layout ?? input.document.state.layoutMode;
    const layout = getCompositionLayout({
      layoutMode,
      screenAspectRatio: input.document.state.screenAspectRatio,
      screenIntrinsicAspect:
        baseSource?.kind === "video" && needsIntrinsicAspect
          ? await intrinsicAspectOf(baseSource.path)
          : null,
      cameraFrame: input.document.state.cameraFrame,
      frameAspect
    });
    // The webcam clip on screen styles the camera layer for this window; each
    // property it leaves out falls back to the project style, so the file shows
    // the same shape and border the canvas resolves at that moment.
    const cameraStyle = resolveCameraStyle(camera?.cameraStyle, {
      shape: input.document.state.cameraShape,
      border: input.document.state.cameraBorderStyle
    });
    const cameraLayoutBorder = resolveCameraBorder({
      layoutMode,
      borderStyle: cameraStyle.border
    });
    const cameraLayer: TimelineCompositionCameraLayer | undefined =
      cameraSource !== undefined && camera !== null && layout.camera !== null
        ? {
            path: cameraSource.path,
            sourceStart: camera.sourceStart + (window.start - camera.start),
            frame: layout.camera.frame,
            fit: layout.camera.fit,
            shape: cameraStyle.shape,
            ...(cameraLayoutBorder === null ? {} : { border: cameraLayoutBorder })
          }
        : undefined;
    const cameraFields = cameraLayer === undefined ? {} : { camera: cameraLayer };
    const clipAudio = base === null ? undefined : videoAudioById.get(base.id);
    const cropFilter = base !== null && base.itemId === `${projectId}:screen`
      ? screenCropFilter(input.document.state.screenCrop) ?? undefined
      : undefined;

    if (base !== null && baseSource !== undefined && layout.base !== null) {
      const hasAudio = baseSource.kind === "video" && await mediaHasAudio(baseSource.path);
      videoSegments.push({
        id: `${base.id}@${window.start}`,
        sourceId: base.id,
        path: baseSource.path,
        kind: baseSource.kind === "image" ? "image" : "video",
        start: window.start,
        end: window.end,
        // The trimmed piece starts where the visible range begins in the source.
        sourceStart: base.sourceStart + (window.start - base.start),
        volume: clipAudio?.volume ?? 1,
        hasAudio,
        ...(clipAudio?.cleanupFilter === undefined ? {} : { cleanupFilter: clipAudio.cleanupFilter }),
        ...(cropFilter === undefined ? {} : { cropFilter }),
        ...resolveEdgeTransitionTiming(
          input.document.state.edgeTransitions,
          base,
          window.start,
          window.end
        ),
        ...cameraFields
      });
      continue;
    }

    // The preset hides the base picture (camera-only) or the screen was cut
    // away here: the webcam is the only picture, and the base clip's own sound
    // still belongs to this stretch of the timeline.
    if (base !== null && baseSource !== undefined && baseSource.kind === "video") {
      if (await mediaHasAudio(baseSource.path)) {
        audioSegments.push({
          path: baseSource.path,
          start: window.start,
          end: window.end,
          sourceStart: base.sourceStart + (window.start - base.start),
          volume: clipAudio?.volume ?? 1,
          ...(clipAudio?.cleanupFilter === undefined ? {} : { cleanupFilter: clipAudio.cleanupFilter }),
          speedAffected: true
        });
      }
    }
    videoSegments.push({
      id: `color@${window.start}`,
      path: "",
      kind: "color",
      start: window.start,
      end: window.end,
      sourceStart: 0,
      volume: 0,
      hasAudio: false,
      ...cameraFields
    });
  }

  const stateRange = input.document.state.trimRange;
  const trimStart = input.trimStart ?? stateRange.start;
  const trimEnd = input.trimEnd ?? (stateRange.end > trimStart ? stateRange.end : null);
  const timelineEnd = input.document.state.timelineSegments.reduce(
    (maximum, segment) => Math.max(maximum, segment.end),
    0
  );
  const effectiveTrimEnd = trimEnd ?? timelineEnd;
  const subtitleMode = input.subtitleMode ?? "burn-in";
  const exportSubtitles = retimeSubtitlesForSpeed(
    input.document.state.subtitles,
    input.document.state.speedEffects,
    trimStart,
    effectiveTrimEnd
  );
  const exportTextOverlays = retimeTextOverlaysForSpeed(
    input.document.state.textOverlays ?? [],
    input.document.state.speedEffects,
    trimStart,
    effectiveTrimEnd
  );
  const background = await resolveExportBackground(input.document, sourceById);
  const subtitleRequest: ExportVideoRequest = {
    jobId: randomUUID(),
    source: { kind: "project", projectId }, format: input.format, resolution: input.resolution,
    trimStart: 0, trimEnd: null, volume: 1, audioLevels: {}, backgroundAudioImportIds: [],
    subtitles: exportSubtitles,
    subtitleMode
  };
  const temporarySubtitles = subtitleMode === "burn-in"
    ? await writeTemporarySubtitleSidecar(subtitleRequest)
    : null;
  const subtitlePath = subtitleMode === "none"
    ? null
    : subtitleMode === "burn-in"
      ? temporarySubtitles?.path ?? null
      : await writeSubtitleSidecar(input.outputPath, subtitleRequest);
  let bytesWritten: number;
  let exportCompleted = false;
  try {
    bytesWritten = await exportTimelineComposition({
      videoSegments, audioSegments, outputPath: input.outputPath, format: input.format,
      resolution: input.resolution, trimStart, trimEnd,
      subtitlePath: subtitleMode === "burn-in" ? subtitlePath : null,
      subtitleForceStyle: subtitleMode === "burn-in"
        ? subtitleForceStyle(input.document.state.subtitleStyle, input.resolution === "vertical")
        : undefined,
      transitions: input.document.state.transitions ?? [],
      zoomEffects: input.document.state.zoomEffects,
      speedEffects: input.document.state.speedEffects,
      textOverlays: exportTextOverlays,
      background: background ? { imagePath: background.imagePath } : undefined,
      youtubeVolume: input.document.state.youtubeVolume?.enabled
        ? {
            targetLufs: input.document.state.youtubeVolume.targetLufs,
            truePeakDb: input.document.state.youtubeVolume.truePeakDb
          }
        : undefined
    }, input.control);
    exportCompleted = true;
  } finally {
    await temporarySubtitles?.cleanup().catch(() => undefined);
    await background?.cleanup().catch(() => undefined);
    if (subtitlePath && subtitleMode === "sidecar" && !exportCompleted) {
      await fs.rm(subtitlePath, { force: true }).catch(() => undefined);
    }
  }
  return { path: input.outputPath, bytesWritten, subtitlePath: subtitleMode === "sidecar" ? subtitlePath : null };
}

const bundledBackgroundPrefixes: Record<string, string> = {
  "real-world-1": "scene-skyline",
  "real-world-2": "scene-cityscape",
  "real-world-3": "scene-coast",
  "real-world-4": "style-florals",
  "real-world-5": "style-chrome",
  "real-world-6": "style-marble",
  "gradient-1": "gradient-dawn",
  "gradient-2": "gradient-silver",
  "gradient-3": "gradient-ultraviolet",
  "animated-1": "gradient-dawn",
  "animated-2": "gradient-ultraviolet",
  "animated-3": "gradient-dawn"
};

async function resolveExportBackground(
  document: EditorProjectStateFile,
  sourceById: ReadonlyMap<string, { path: string; kind: "video" | "audio" | "image" }>
): Promise<{ imagePath: string; cleanup: () => Promise<void> } | null> {
  const style = document.state.backgroundStyle;
  const customId = document.state.customBackgroundImportId;
  if (style === "custom" && customId) {
    const source = sourceById.get(customId);
    if (source?.kind === "image" && await fileExists(source.path)) {
      return { imagePath: source.path, cleanup: async () => undefined };
    }
    return null;
  }
  const prefix = bundledBackgroundPrefixes[style];
  if (!prefix) return null;
  const assetsDirectory = path.resolve(__dirname, "..", "..", "dist-renderer", "assets");
  const entries = await fs.readdir(assetsDirectory).catch(() => [] as string[]);
  const asset = entries.find((name) => name.startsWith(prefix) && /\.(?:jpg|jpeg|png)$/iu.test(name));
  if (!asset) return null;
  const temporaryPath = path.join(os.tmpdir(), `ovc-background-${randomUUID()}${path.extname(asset)}`);
  await fs.copyFile(path.join(assetsDirectory, asset), temporaryPath);
  return { imagePath: temporaryPath, cleanup: () => fs.rm(temporaryPath, { force: true }) };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function retimeTextOverlaysForSpeed(
  overlays: TextOverlay[],
  effects: Array<{ start: number; end: number; rate: SpeedRate }>,
  trimStart: number,
  trimEnd: number
): TextOverlay[] {
  return overlays
    .filter((overlay) => overlay.end > trimStart && overlay.start < trimEnd)
    .map((overlay) => ({
      ...overlay,
      start: mapTimelineTimeThroughSpeed(Math.max(trimStart, overlay.start), effects, trimStart, trimEnd),
      end: mapTimelineTimeThroughSpeed(Math.min(trimEnd, overlay.end), effects, trimStart, trimEnd)
    }))
    .filter((overlay) => overlay.end - overlay.start >= 0.01);
}

export function retimeSubtitlesForSpeed(
  subtitles: Array<{ start: number; end: number; text: string }>,
  effects: Array<{ start: number; end: number; rate: SpeedRate }>,
  trimStart: number,
  trimEnd: number
): Array<{ start: number; end: number; text: string }> {
  return subtitles
    .filter((subtitle) => subtitle.end > trimStart && subtitle.start < trimEnd)
    .map((subtitle) => ({
      start: mapTimelineTimeThroughSpeed(Math.max(trimStart, subtitle.start), effects, trimStart, trimEnd),
      end: mapTimelineTimeThroughSpeed(Math.min(trimEnd, subtitle.end), effects, trimStart, trimEnd),
      text: subtitle.text
    }))
    .filter((subtitle) => subtitle.end - subtitle.start >= 0.01);
}

/** Convert a source-timeline timestamp to exported wall time. */
function mapTimelineTimeThroughSpeed(
  value: number,
  effects: Array<{ start: number; end: number; rate: SpeedRate }>,
  trimStart: number,
  trimEnd: number
): number {
  const target = Math.max(trimStart, Math.min(value, trimEnd));
  let cursor = trimStart;
  let outputTime = 0;
  const ordered = [...effects].sort((a, b) => a.start - b.start);
  for (const effect of ordered) {
    const start = Math.max(trimStart, effect.start);
    const end = Math.min(trimEnd, effect.end);
    if (end <= cursor) continue;
    if (start >= target) break;
    if (start > cursor) {
      const normalEnd = Math.min(start, target);
      outputTime += normalEnd - cursor;
      cursor = normalEnd;
      if (cursor >= target) return outputTime;
    }
    const spedEnd = Math.min(end, target);
    outputTime += Math.max(0, spedEnd - cursor) / effect.rate;
    cursor = Math.max(cursor, spedEnd);
    if (cursor >= target) return outputTime;
  }
  return outputTime + Math.max(0, target - cursor);
}

function addProjectSource(
  target: Map<string, { path: string; kind: "video" | "audio" | "image"; role: CompositionRole }>,
  id: string,
  rootPath: string,
  track: ProjectFile["tracks"][keyof ProjectFile["tracks"]] | undefined,
  kind: "video" | "audio",
  role: CompositionRole
) {
  if (track) target.set(id, { path: resolveContainedProjectPath(rootPath, track.path), kind, role });
}

/**
 * Registers every recorded screen and webcam track. Media ids follow the editor
 * rule (`<projectId>:<trackId>`), so a channel such as `camera-2` resolves to the
 * same item the timeline clip references, and its role decides the layer.
 */
function registerProjectVideoTracks(
  target: Map<string, { path: string; kind: "video" | "audio" | "image"; role: CompositionRole }>,
  rootPath: string,
  projectId: string,
  tracks: ProjectFile["tracks"]
) {
  for (const [trackId, track] of Object.entries(tracks)) {
    if (!track) continue;
    const kind = getRecordingKindForTrackId(trackId);
    if (kind !== "screen" && kind !== "camera") continue;
    const itemId = `${projectId}:${trackId}`;
    if (target.has(itemId)) continue;
    target.set(itemId, {
      path: resolveContainedProjectPath(rootPath, track.path),
      kind: "video",
      role: kind === "camera" ? "camera" : "base"
    });
  }
}
