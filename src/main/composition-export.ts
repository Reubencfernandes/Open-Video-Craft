/** Pure Node timeline export entry point shared by Electron and the MCP server. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { exportTimelineComposition, mediaHasAudio } from "./ffmpeg";
import type { TimelineCompositionAudioSegment, TimelineCompositionVideoSegment } from "./ffmpeg";
import { writeSubtitleSidecar } from "./subtitle-export";
import type {
  EditorProjectStateFile,
  ExportResolution,
  ExportSubtitleMode,
  ExportVideoFormat,
  ExportVideoRequest,
  ExportVideoResult,
  ProjectFile
} from "../shared/types";
import { validateClipTransitions } from "../shared/editor-domain";
import type { TextOverlay } from "../shared/editor-domain";

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
}): Promise<ExportVideoResult> {
  validateClipTransitions(
    input.document.state.timelineSegments,
    input.document.state.transitions ?? []
  );
  const sourceById = new Map<string, { path: string; kind: "video" | "audio" | "image" }>();
  const projectId = input.project.id;
  addProjectSource(sourceById, `${projectId}:screen`, input.rootPath, input.project.tracks.screen, "video");
  addProjectSource(sourceById, `${projectId}:audio`, input.rootPath, input.project.tracks.micWav ?? input.project.tracks.micWebm, "audio");
  addProjectSource(sourceById, `${projectId}:system-audio`, input.rootPath, input.project.tracks.systemWav ?? input.project.tracks.systemWebm, "audio");
  for (const imported of input.document.imports) {
    const absolutePath = path.resolve(input.rootPath, imported.relativePath);
    const rootPrefix = `${path.resolve(input.rootPath)}${path.sep}`;
    if (!absolutePath.startsWith(rootPrefix)) throw new Error(`Imported media "${imported.name}" is outside the project folder.`);
    sourceById.set(imported.id, { path: absolutePath, kind: imported.kind });
  }

  const videoSegments: TimelineCompositionVideoSegment[] = [];
  const audioSegments: TimelineCompositionAudioSegment[] = [];
  for (const segment of input.document.state.timelineSegments) {
    const source = sourceById.get(segment.itemId);
    if (!source) throw new Error(`Timeline media "${segment.itemId}" is unavailable.`);
    const level = input.document.state.audioLevels[segment.itemId];
    const volume = level?.muted ? 0 : Math.max(0, (level?.volume ?? 100) / 100) * input.document.state.masterVolume / 100;
    if (segment.track === "video") {
      if (source.kind === "audio") throw new Error(`Audio item "${segment.itemId}" cannot appear on the video track.`);
      videoSegments.push({
        id: segment.id, path: source.path, kind: source.kind, start: segment.start, end: segment.end,
        sourceStart: segment.sourceStart, volume,
        hasAudio: source.kind === "video" && await mediaHasAudio(source.path)
      });
    } else {
      audioSegments.push({ path: source.path, start: segment.start, end: segment.end, sourceStart: segment.sourceStart, volume });
    }
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
  const subtitleRequest: ExportVideoRequest = {
    source: { kind: "project", projectId }, format: input.format, resolution: input.resolution,
    trimStart: 0, trimEnd: null, volume: 1, audioLevels: {}, backgroundAudioImportIds: [],
    subtitles: exportSubtitles,
    subtitleMode
  };
  const subtitlePath = subtitleMode === "none" ? null : await writeSubtitleSidecar(input.outputPath, subtitleRequest);
  let bytesWritten: number;
  try {
    bytesWritten = await exportTimelineComposition({
      videoSegments, audioSegments, outputPath: input.outputPath, format: input.format,
      resolution: input.resolution, trimStart, trimEnd,
      subtitlePath: subtitleMode === "burn-in" ? subtitlePath : null,
      transitions: input.document.state.transitions ?? [],
      zoomEffects: input.document.state.zoomEffects,
      speedEffects: input.document.state.speedEffects,
      textOverlays: exportTextOverlays
    });
  } finally {
    if (subtitleMode === "burn-in" && subtitlePath) await fs.rm(subtitlePath, { force: true }).catch(() => undefined);
  }
  return { path: input.outputPath, bytesWritten, subtitlePath: subtitleMode === "sidecar" ? subtitlePath : null };
}

export function retimeTextOverlaysForSpeed(
  overlays: TextOverlay[],
  effects: Array<{ start: number; end: number; rate: 1 | 2 | 3 | 4 | 5 }>,
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
  effects: Array<{ start: number; end: number; rate: 1 | 2 | 3 | 4 | 5 }>,
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
  effects: Array<{ start: number; end: number; rate: 1 | 2 | 3 | 4 | 5 }>,
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
  target: Map<string, { path: string; kind: "video" | "audio" | "image" }>,
  id: string,
  rootPath: string,
  track: ProjectFile["tracks"][keyof ProjectFile["tracks"]] | undefined,
  kind: "video" | "audio"
) {
  if (track) target.set(id, { path: path.join(rootPath, track.path), kind });
}
