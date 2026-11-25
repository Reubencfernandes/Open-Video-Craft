/**
 * Builds a short vertical reel as its own project (S3, S6, S7).
 *
 * The reel is derived, never destructive: the source project keeps its full
 * timeline, and the new project references copies of the media it needs as
 * imports, with its own timeline of highlight ranges, its own subtitle track
 * clipped to those ranges, and a TikTok-friendly subtitle style.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveEditorDocument } from "./editor-document-store";
import { importsDirectoryName, mediaTrackRelativePaths } from "./project-paths";
import type { ProjectStore } from "./project-store";
import type { EditorProjectImport, EditorProjectStateFile, ProjectView } from "../shared/types";
import {
  createDefaultEditorState,
  type SubtitleSegment
} from "../shared/editor-domain";
import type { EditorStateSnapshot, SubtitleStyle } from "../shared/editor-domain";
import { reelDuration, type ReelHighlight } from "../shared/editor-domain/reel-highlights";

export const reelSubtitleStyle: SubtitleStyle = "karaoke";
/** The reel frame is 9:16; the caller passes this to the exporter. */
export const reelExportResolution = "vertical" as const;

export interface CreateReelProjectInput {
  readonly store: ProjectStore;
  readonly sourceProject: Pick<ProjectView, "id" | "name" | "rootPath" | "durationMs">;
  readonly ranges: readonly ReelHighlight[];
  readonly subtitles?: readonly SubtitleSegment[];
  readonly subtitleStyle?: SubtitleStyle;
  readonly title?: string;
}

/**
 * Shifts every subtitle cue of a range onto the reel timeline, dropping what
 * falls outside the kept moments.
 */
export function retimeSubtitlesForRanges(
  subtitles: readonly SubtitleSegment[],
  ranges: readonly ReelHighlight[]
): SubtitleSegment[] {
  const result: SubtitleSegment[] = [];
  let offset = 0;
  ranges.forEach((range, rangeIndex) => {
    const length = Math.max(0, range.end - range.start);
    for (const cue of subtitles) {
      const start = Math.max(cue.start, range.start);
      const end = Math.min(cue.end, range.end);
      if (end - start <= 0.05) continue;
      result.push({
        ...cue,
        id: `${cue.id}-reel-${rangeIndex + 1}`,
        start: Math.round((start - range.start + offset) * 1000) / 1000,
        end: Math.round((end - range.start + offset) * 1000) / 1000
      });
    }
    offset += length;
  });
  return result;
}

interface CopiedSource {
  readonly importEntry: EditorProjectImport;
}

async function copyIntoImports(
  sourcePath: string,
  targetRoot: string,
  name: string,
  kind: "video" | "audio",
  durationSeconds: number | null
): Promise<CopiedSource | null> {
  try {
    await fs.access(sourcePath);
  } catch {
    return null;
  }
  const extension = path.extname(name).replace(/^\./u, "") || (kind === "video" ? "webm" : "wav");
  const id = randomUUID();
  const relativePath = path.posix.join(importsDirectoryName, `${id}.${extension}`);
  const targetPath = path.join(targetRoot, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  return {
    importEntry: {
      id,
      name,
      kind,
      extension,
      duration: durationSeconds,
      relativePath
    }
  };
}

/**
 * Creates the derived reel project and returns its view. Media is copied, so the
 * reel keeps working even if the original project is moved.
 */
export async function createReelProject(input: CreateReelProjectInput): Promise<ProjectView> {
  const { store, sourceProject, ranges } = input;
  if (ranges.length === 0) throw new Error("A reel needs at least one highlight range.");

  const rootPath = sourceProject.rootPath;
  const baseDirectory = path.dirname(rootPath);
  const name = input.title?.trim().length
    ? input.title.trim()
    : `${sourceProject.name} Reel`;
  const created = await store.createProject({ name, baseDirectory });

  const imports: EditorProjectImport[] = [];
  const videoSource = await copyIntoImports(
    path.join(rootPath, mediaTrackRelativePaths.screen),
    created.rootPath,
    "screen.webm",
    "video",
    (sourceProject.durationMs ?? 0) / 1000 || null
  );
  if (!videoSource) throw new Error("The source project has no recorded screen to build a reel from.");
  imports.push(videoSource.importEntry);

  const audioSources: EditorProjectImport[] = [];
  for (const [trackPath, label, kind] of [
    [mediaTrackRelativePaths.micWav, "mic.wav", "audio"],
    [mediaTrackRelativePaths.systemWav, "system.wav", "audio"]
  ] as const) {
    const copied = await copyIntoImports(
      path.join(rootPath, trackPath),
      created.rootPath,
      label,
      kind,
      (sourceProject.durationMs ?? 0) / 1000 || null
    );
    if (copied) {
      imports.push(copied.importEntry);
      audioSources.push(copied.importEntry);
    }
  }

  const timelineSegments: EditorStateSnapshot["timelineSegments"] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const length = Math.max(0.1, range.end - range.start);
    timelineSegments.push({
      id: `reel-video-${index + 1}`,
      itemId: videoSource.importEntry.id,
      track: "video",
      lane: 0,
      start: Math.round(cursor * 1000) / 1000,
      end: Math.round((cursor + length) * 1000) / 1000,
      sourceStart: range.start
    });
    for (const audio of audioSources) {
      timelineSegments.push({
        id: `reel-${audio.kind}-${index + 1}-${audio.id.slice(0, 6)}`,
        itemId: audio.id,
        track: "audio",
        lane: 0,
        start: Math.round(cursor * 1000) / 1000,
        end: Math.round((cursor + length) * 1000) / 1000,
        sourceStart: range.start
      });
    }
    cursor += length;
  });

  const state: EditorStateSnapshot = {
    ...createDefaultEditorState(),
    timelineSegments,
    subtitles: retimeSubtitlesForRanges(input.subtitles ?? [], ranges),
    subtitleLanguage: null,
    subtitleStyle: input.subtitleStyle ?? reelSubtitleStyle,
    trimRange: { start: 0, end: Math.max(0.1, reelDuration(ranges)) }
  };

  const document: EditorProjectStateFile = await saveEditorDocument({
    rootPath: created.rootPath,
    baseRevision: 0,
    state,
    imports,
    source: "editor",
    summary: `Reel from ${ranges.length} highlight${ranges.length === 1 ? "" : "s"}.`,
    checkpoint: false
  });

  void document;
  return store.loadProject(created.rootPath);
}
