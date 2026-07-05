import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toEditorMediaItem } from "./media-utils";
import { areTimelineSegmentsEqual } from "./timeline-utils";
import type {
  BackgroundStyle,
  EditorMediaItem,
  EditorTool,
  MediaPanel,
  TimelineSegment
} from "./types";

type AudioLevelState = Record<string, { volume: number; muted: boolean }>;

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
    if (files.length === 0) {
      return;
    }

    const nextItems = files.map(toEditorMediaItem);
    setImportedMedia((current) => [...current, ...nextItems]);

    if (options.backgroundAudio) {
      const audioIds = nextItems
        .filter((item) => item.kind === "audio")
        .map((item) => item.id);
      setBackgroundAudioIds((current) => [...new Set([...current, ...audioIds])]);
      setActiveTool("audio");
    }

    if (options.selectFirst ?? true) {
      setSelectedItemId(nextItems[0].id);
    }

    setActivePanel("all");
  }

  async function importCustomBackground() {
    const files = await window.openVideoCraft.editor.importMedia();
    const background = files.find((file) => file.kind === "image");

    if (!background) {
      setError("Choose an image file for the custom background.");
      return;
    }

    setError(null);
    setCustomBackgroundUrl(background.url);
    setBackgroundStyle("custom");
  }

  function removeImportedMedia(itemId: string) {
    void window.openVideoCraft.editor.removeImportedMedia(itemId);
    setImportedMedia((current) => current.filter((item) => item.id !== itemId));
    setBackgroundAudioIds((current) => current.filter((id) => id !== itemId));
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
    removeImportedMedia,
    selectTimelineItem,
    setAudioLevel,
    updateDuration,
    updateMediaDuration
  };
}
