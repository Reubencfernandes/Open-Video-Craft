/**
 * Media library actions: import (incl. background music onto the timeline),
 * remove, select-with-seek, duration updates, and per-source audio levels.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ImportedMediaFile } from "../../shared/types";
import { toEditorMediaItem } from "./media-utils";
import { areTimelineSegmentsEqual, resolveAudioLane } from "./timeline-utils";
import { createId } from "./utils";
import type {
  BackgroundStyle,
  EditorMediaItem,
  EditorTool,
  MediaPanel,
  TimelineSegment
} from "./types";

type AudioLevelState = Record<string, { volume: number; muted: boolean }>;

type MediaIngestOptions = {
  addToTimeline?: boolean;
  backgroundAudio?: boolean;
  customBackground?: boolean;
  selectFirst?: boolean;
  timelineStart?: number;
};

// Extensions the app can actually decode and play. Files outside this set
// (including extensionless files, which are common on macOS) are rejected at
// import time: the project store refuses to persist an unknown extension, which
// otherwise wedged the 1.5s autosave in a permanent error-retry loop with no
// way out but removing the import. Keep in sync with the dialog filter in
// main/file-dialogs.ts.
const supportedImportExtensions = new Set([
  "mp4", "mov", "mkv", "webm", "avi",
  "mp3", "wav", "m4a", "aac", "ogg",
  "png", "jpg", "jpeg", "webp", "gif"
]);

function partitionImports(files: ImportedMediaFile[]): {
  supported: ImportedMediaFile[];
  rejected: ImportedMediaFile[];
} {
  const supported: ImportedMediaFile[] = [];
  const rejected: ImportedMediaFile[] = [];
  for (const file of files) {
    if (supportedImportExtensions.has(file.extension.toLowerCase())) {
      supported.push(file);
    } else {
      rejected.push(file);
    }
  }
  return { supported, rejected };
}

// Drop rejected imports from the main-process cache so they don't linger, and
// build a user-facing message naming them.
function forgetRejectedImports(rejected: ImportedMediaFile[]): void {
  for (const file of rejected) {
    void window.openVideoCraft.editor.removeImportedMedia(file.id);
  }
}

function describeRejectedImports(rejected: ImportedMediaFile[]): string {
  const names = rejected.map((file) => file.name).join(", ");
  return `Skipped ${rejected.length} unsupported file${
    rejected.length === 1 ? "" : "s"
  }: ${names}. Import video, audio, or image files.`;
}

type UseEditorMediaActionsParams = {
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  projectMedia: EditorMediaItem[];
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  setActivePanel: Dispatch<SetStateAction<MediaPanel>>;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setAudioLevels: Dispatch<SetStateAction<AudioLevelState>>;
  setBackgroundAudioIds: Dispatch<SetStateAction<string[]>>;
  setBackgroundStyle: Dispatch<SetStateAction<BackgroundStyle>>;
  customBackgroundImportId: string | null;
  setCustomBackgroundImportId: Dispatch<SetStateAction<string | null>>;
  setCustomBackgroundUrl: Dispatch<SetStateAction<string | null>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setImportedMedia: Dispatch<SetStateAction<EditorMediaItem[]>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  timelineSegments: TimelineSegment[];
};

export function useEditorMediaActions(params: UseEditorMediaActionsParams) {
  const {
    projectMedia,
    knownTimelineItemIdsRef,
    scheduleTimelinePlaybackSync,
    seek,
    setActivePanel,
    setActiveTool,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    customBackgroundImportId,
    setCustomBackgroundImportId,
    setCustomBackgroundUrl,
    setDuration,
    setError,
    setImportedMedia,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    setTimelineSegments,
    timelineSegments
  } = params;

  async function importMedia(options: {
    backgroundAudio?: boolean;
    selectFirst?: boolean;
  } = {}) {
    const files = await window.openVideoCraft.editor.importMedia();
    await ingestImportedFiles(files, options);
  }

  // Import OS drag-and-dropped files. The paths are resolved from the drop event
  // in the media panel; everything after that mirrors the dialog import path.
  async function importMediaFromPaths(
    filePaths: string[],
    options: MediaIngestOptions = {}
  ) {
    if (filePaths.length === 0) {
      return;
    }
    const files = await window.openVideoCraft.editor.importMediaPaths(filePaths);
    await ingestImportedFiles(files, options);
  }

  async function ingestImportedFiles(
    files: Awaited<ReturnType<typeof window.openVideoCraft.editor.importMedia>>,
    options: MediaIngestOptions = {}
  ) {
    if (files.length === 0) {
      return;
    }

    const { supported, rejected } = partitionImports(files);
    forgetRejectedImports(rejected);
    if (rejected.length > 0) {
      setError(describeRejectedImports(rejected));
    }
    if (supported.length === 0) {
      return;
    }

    const nextItems = supported.map(toEditorMediaItem);
    setImportedMedia((current) => [...current, ...nextItems]);

    if (options.customBackground) {
      const backgroundItem = nextItems.find((item) => item.kind === "image");
      if (!backgroundItem) {
        setError("Choose an image file for the custom background.");
        return;
      }
      setCustomBackgroundImportId(backgroundItem.id);
      setCustomBackgroundUrl(backgroundItem.url);
      setBackgroundStyle("custom");
    }

    if (options.backgroundAudio) {
      const audioItems = nextItems.filter((item) => item.kind === "audio");
      const audioIds = audioItems.map((item) => item.id);
      setBackgroundAudioIds((current) => [...new Set([...current, ...audioIds])]);
      // Background music must land on the timeline (as its own audio lane) so it
      // actually plays and can be trimmed/moved. Unknown-length clips start as a
      // short placeholder and expand once their real duration resolves.
      for (const item of audioItems) {
        knownTimelineItemIdsRef.current.add(item.id);
      }
      setTimelineSegments((current) => {
        const additions: TimelineSegment[] = [];
        for (const item of audioItems) {
          if (
            current.some((segment) => segment.itemId === item.id) ||
            additions.some((segment) => segment.itemId === item.id)
          ) {
            continue;
          }

          const start = 0;
          const end = start + (item.duration && item.duration > 0 ? item.duration : 1);
          const segmentId = `${item.id}:segment-bg`;
          const lane = resolveAudioLane([...current, ...additions], segmentId, start, end, 0);
          additions.push({
            id: segmentId,
            itemId: item.id,
            track: "audio",
            lane,
            start,
            end,
            sourceStart: 0
          });
        }

        if (additions.length === 0) {
          return current;
        }

        const next = [...current, ...additions];
        scheduleTimelinePlaybackSync(next);
        return next;
      });
      setActiveTool("audio");
    }

    if (options.addToTimeline) {
      for (const item of nextItems) {
        knownTimelineItemIdsRef.current.add(item.id);
      }
      setTimelineSegments((current) => {
        const additions: TimelineSegment[] = [];
        let videoStart = Math.max(0, options.timelineStart ?? 0);
        for (const item of nextItems) {
          const track = item.kind === "audio" ? "audio" : "video";
          const start = track === "audio"
            ? Math.max(0, options.timelineStart ?? 0)
            : videoStart;
          const duration = item.duration && item.duration > 0
            ? item.duration
            : item.kind === "image" ? 3 : 1;
          const end = start + duration;
          const segmentId = `${item.id}:segment-${createId("ai-import")}`;
          additions.push({
            id: segmentId,
            itemId: item.id,
            track,
            lane: track === "audio"
              ? resolveAudioLane([...current, ...additions], segmentId, start, end, 0)
              : 0,
            start,
            end,
            sourceStart: 0
          });
          if (track === "video") videoStart = end;
        }
        const next = [...current, ...additions];
        scheduleTimelinePlaybackSync(next);
        return next;
      });
      setActiveTool(nextItems.every((item) => item.kind === "audio") ? "audio" : "media");
    }

    if (options.selectFirst ?? true) {
      setSelectedItemId(nextItems[0].id);
    }

    setActivePanel("all");
  }

  async function importCustomBackground() {
    const files = await window.openVideoCraft.editor.importMedia();
    const { supported, rejected } = partitionImports(files);
    forgetRejectedImports(rejected);
    const background = supported.find((file) => file.kind === "image");

    if (!background) {
      setError(
        rejected.length > 0
          ? describeRejectedImports(rejected)
          : "Choose an image file for the custom background."
      );
      return;
    }

    const backgroundItem = toEditorMediaItem(background);
    setError(null);
    setImportedMedia((current) =>
      current.some((item) => item.id === backgroundItem.id) ? current : [...current, backgroundItem]
    );
    setCustomBackgroundImportId(backgroundItem.id);
    setCustomBackgroundUrl(backgroundItem.url);
    setBackgroundStyle("custom");
  }

  function removeImportedMedia(itemId: string) {
    void window.openVideoCraft.editor.removeImportedMedia(itemId);
    setImportedMedia((current) => current.filter((item) => item.id !== itemId));
    setBackgroundAudioIds((current) => current.filter((id) => id !== itemId));
    if (customBackgroundImportId === itemId) {
      setCustomBackgroundImportId(null);
      setCustomBackgroundUrl(null);
      setBackgroundStyle((current) => (current === "custom" ? "real-world-1" : current));
    }
    setTimelineSegments((current) => {
      const next = current.filter((segment) => segment.itemId !== itemId);
      if (!areTimelineSegmentsEqual(current, next)) {
        scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
    knownTimelineItemIdsRef.current.delete(itemId);
    setSelectedItemId((current) => (current === itemId ? projectMedia[0]?.id ?? null : current));
    setSelectedTimelineSegmentId((current) => {
      const segment = timelineSegments.find((item) => item.id === current);
      return segment?.itemId === itemId ? null : current;
    });
  }

  function selectTimelineItem(itemId: string) {
    setSelectedItemId(itemId);
    const segment = [...timelineSegments]
      .sort((first, second) => first.start - second.start)
      .find((item) => item.itemId === itemId);
    if (segment) {
      setSelectedTimelineSegmentId(segment.id);
      seek(segment.start);
    }
  }

  function updateDuration(value: number | null) {
    if (value && Number.isFinite(value)) {
      setDuration(value);
    }
  }

  function updateMediaDuration(itemId: string, value: number | null) {
    if (!value || !Number.isFinite(value)) {
      return;
    }

    setImportedMedia((current) =>
      current.map((item) => (item.id === itemId ? { ...item, duration: value } : item))
    );
  }

  function setAudioLevel(itemId: string, patch: Partial<{ volume: number; muted: boolean }>) {
    setAudioLevels((current) => {
      const previous = current[itemId] ?? { volume: 100, muted: false };
      return { ...current, [itemId]: { ...previous, ...patch } };
    });
  }

  return {
    importCustomBackground,
    importMedia,
    importMediaFromPaths,
    ingestImportedFiles,
    removeImportedMedia,
    selectTimelineItem,
    setAudioLevel,
    updateDuration,
    updateMediaDuration
  };
}
