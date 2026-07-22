/**
 * Facade that assembles the timeline's behavior from its focused hooks so
 * EditorView wires the whole feature with a single call:
 *
 *   - useTimelineEditing          commit/undo/redo/delete/split + drag & drop
 *                                 from the asset grid + library housekeeping
 *   - useEditorEffects            zoom/speed regions + subtitle CRUD
 *   - useSubtitleGeneration       Whisper transcription (owns sttStatus)
 *   - useTimelineDragInteractions pointer drags on the timeline body
 *   - useTimelineClipboard        clip copy/cut/paste
 *   - useEditorShortcuts          global keyboard shortcuts
 *
 * This file routes each hook's outputs into the hooks that need them and owns
 * the one cross-kind operation: deleting every media/effect/text item touched
 * by a lane-aware marquee.
 */
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { PlaybackSyncReason } from "./playback-sync";
import { useEditorEffects } from "./useEditorEffects";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useSubtitleGeneration } from "./useSubtitleGeneration";
import { useTimelineClipboard } from "./useTimelineClipboard";
import { useTimelineDragInteractions } from "./useTimelineDragInteractions";
import { useTimelineEditing } from "./useTimelineEditing";
import { isTimelineTimedItemInRange } from "./timeline-utils";
import type {
  EditorMediaItem,
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineContextMenu,
  TimelineMediaClip,
  TimelineRangeSelection,
  TimelineSegment,
  ZoomEffect
} from "./types";

type UseTimelineControllerParams = {
  activeDuration: number;
  activeTool: EditorTool;
  allMedia: EditorMediaItem[];
  audioElsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  audioSources: EditorMediaItem[];
  audioTimelineClips: TimelineMediaClip[];
  backgroundAudioIds: string[];
  videoTimelineClips: TimelineMediaClip[];
  beginPlaybackInteraction: () => void;
  currentTime: number;
  currentTimeRef: MutableRefObject<number>;
  endPlaybackInteraction: () => void;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  isEditorStateReady: boolean;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  mediaById: Map<string, EditorMediaItem>;
  mediaDurationById: Map<string, number>;
  onDropNewTextOverlay: (time: number) => void;
  openExportDialog: () => void;
  playingRef: MutableRefObject<boolean>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  seekTimelinePointer: (clientX: number) => void;
  selectedItemId: string | null;
  selectedSpeedId: string | null;
  selectedSubtitleId: string | null;
  selectedTextOverlayId: string | null;
  selectedTimelineItemId: string | null;
  selectedTimelineSegmentId: string | null;
  selectedTimelineSegmentIds: string[];
  selectedZoomId: string | null;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setScrubbingTimeline: Dispatch<SetStateAction<boolean>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpeedId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTextOverlayId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentIds: Dispatch<SetStateAction<string[]>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSpeedEffects: Dispatch<SetStateAction<SpeedEffect[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineRangeSelection: Dispatch<SetStateAction<TimelineRangeSelection | null>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineViewDuration: Dispatch<SetStateAction<number>>;
  setTrimRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  syncMediaToTime: (time: number, isPlaying: boolean, reason?: PlaybackSyncReason) => void;
  textOverlays: TextOverlay[];
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  timelineRangeSelection: TimelineRangeSelection | null;
  timelineEditableItems: EditorMediaItem[];
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  togglePlayback: () => void;
  updateMediaDuration: (itemId: string, duration: number | null) => void;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  zoomEffects: ZoomEffect[];
};

export function useTimelineController(params: UseTimelineControllerParams) {
  const editing = useTimelineEditing({
    activeDuration: params.activeDuration,
    audioElsRef: params.audioElsRef,
    getTimelineTimeFromClientX: params.getTimelineTimeFromClientX,
    isEditorStateReady: params.isEditorStateReady,
    knownTimelineItemIdsRef: params.knownTimelineItemIdsRef,
    mediaById: params.mediaById,
    mediaDurationById: params.mediaDurationById,
    onDropNewTextOverlay: params.onDropNewTextOverlay,
    scheduleTimelinePlaybackSync: params.scheduleTimelinePlaybackSync,
    seek: params.seek,
    selectedItemId: params.selectedItemId,
    selectedTimelineItemId: params.selectedTimelineItemId,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    selectedTimelineSegmentIds: params.selectedTimelineSegmentIds,
    allMedia: params.allMedia,
    setSelectedItemId: params.setSelectedItemId,
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds: params.setSelectedTimelineSegmentIds,
    setTimelineContextMenu: params.setTimelineContextMenu,
    setTimelineRangeSelection: params.setTimelineRangeSelection,
    setTimelineSegments: params.setTimelineSegments,
    setTimelineViewDuration: params.setTimelineViewDuration,
    setTrimRange: params.setTrimRange,
    timelineDuration: params.timelineDuration,
    timelineEditableItems: params.timelineEditableItems,
    timelineRenderDuration: params.timelineRenderDuration,
    timelineSegments: params.timelineSegments,
    updateMediaDuration: params.updateMediaDuration
  });

  const effects = useEditorEffects({
    activeDuration: params.activeDuration,
    currentTime: params.currentTime,
    currentTimeRef: params.currentTimeRef,
    playingRef: params.playingRef,
    setActiveTool: params.setActiveTool,
    setError: params.setError,
    setSelectedSpeedId: params.setSelectedSpeedId,
    setSelectedSubtitleId: params.setSelectedSubtitleId,
    setSelectedZoomId: params.setSelectedZoomId,
    setSpeedEffects: params.setSpeedEffects,
    setSubtitles: params.setSubtitles,
    setZoomEffects: params.setZoomEffects,
    speedEffects: params.speedEffects,
    syncMediaToTime: params.syncMediaToTime,
    timelineDuration: params.timelineDuration,
    zoomEffects: params.zoomEffects
  });

  const subtitleGeneration = useSubtitleGeneration({
    audioClips: params.audioTimelineClips,
    videoClips: params.videoTimelineClips,
    audioLevels: params.audioLevels,
    backgroundAudioIds: params.backgroundAudioIds,
    setError: params.setError,
    setSelectedSubtitleId: params.setSelectedSubtitleId,
    setSubtitleLanguage: params.setSubtitleLanguage,
    setSubtitles: params.setSubtitles
  });

  const drags = useTimelineDragInteractions({
    beginPlaybackInteraction: params.beginPlaybackInteraction,
    clearMediaSelection: () => {
      params.setSelectedTimelineSegmentId(null);
      params.setSelectedTimelineSegmentIds([]);
      params.setTimelineRangeSelection(null);
    },
    currentTimeRef: params.currentTimeRef,
    endPlaybackInteraction: params.endPlaybackInteraction,
    getTimelineTimeFromClientX: params.getTimelineTimeFromClientX,
    mediaDurationById: params.mediaDurationById,
    scheduleTimelinePlaybackSync: params.scheduleTimelinePlaybackSync,
    seek: params.seek,
    seekTimelinePointer: params.seekTimelinePointer,
    setActiveTool: params.setActiveTool,
    setScrubbingTimeline: params.setScrubbingTimeline,
    setSelectedItemId: params.setSelectedItemId,
    setSelectedSpeedId: params.setSelectedSpeedId,
    setSelectedSubtitleId: params.setSelectedSubtitleId,
    setSelectedTextOverlayId: params.setSelectedTextOverlayId,
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds: params.setSelectedTimelineSegmentIds,
    setSelectedZoomId: params.setSelectedZoomId,
    setSubtitles: params.setSubtitles,
    setTimelineContextMenu: params.setTimelineContextMenu,
    setTimelineRangeSelection: params.setTimelineRangeSelection,
    setTimelineRedoStack: editing.setTimelineRedoStack,
    setTimelineSegments: params.setTimelineSegments,
    setTimelineUndoStack: editing.setTimelineUndoStack,
    speedEffects: params.speedEffects,
    selectedTimelineSegmentIds: params.selectedTimelineSegmentIds,
    subtitles: params.subtitles,
    textOverlays: params.textOverlays,
    timelineBodyRef: params.timelineBodyRef,
    timelineDuration: params.timelineDuration,
    timelineRangeSelection: params.timelineRangeSelection,
    timelineRenderDuration: params.timelineRenderDuration,
    timelineSegments: params.timelineSegments,
    updateSpeedEffect: effects.updateSpeedEffect,
    updateSubtitle: effects.updateSubtitle,
    updateTextOverlay: params.updateTextOverlay,
    updateZoomEffect: effects.updateZoomEffect,
    zoomEffects: params.zoomEffects
  });

  const clipboard = useTimelineClipboard({
    commitTimelineSegments: editing.commitTimelineSegments,
    currentTimeRef: params.currentTimeRef,
    deleteTimelineSegment: editing.deleteTimelineSegment,
    knownTimelineItemIdsRef: params.knownTimelineItemIdsRef,
    mediaById: params.mediaById,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    setExportMessage: params.setExportMessage,
    setSelectedItemId: params.setSelectedItemId,
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    timelineRenderDuration: params.timelineRenderDuration,
    timelineSegments: params.timelineSegments
  });

  function deleteSelectedTimelineItems() {
    const selection = params.timelineRangeSelection;
    if (!selection) {
      if (params.selectedTimelineSegmentIds.length > 0 || params.selectedTimelineSegmentId) {
        editing.deleteSelectedTimelineSegment();
        return;
      }
      if (params.selectedZoomId) {
        effects.removeZoomEffect(params.selectedZoomId);
        return;
      }
      if (params.selectedSpeedId) {
        effects.removeSpeedEffect(params.selectedSpeedId);
        return;
      }
      if (params.selectedSubtitleId) {
        params.setSubtitles((current) =>
          current.filter((subtitle) => subtitle.id !== params.selectedSubtitleId)
        );
        params.setSelectedSubtitleId(null);
        return;
      }
      if (params.selectedTextOverlayId) {
        params.setTextOverlays((current) =>
          current.filter((overlay) => overlay.id !== params.selectedTextOverlayId)
        );
        params.setSelectedTextOverlayId(null);
      }
      return;
    }

    const zoomIds = new Set(
      params.zoomEffects
        .filter((item) =>
          isTimelineTimedItemInRange(selection, "zoom", item.start, item.end)
        )
        .map((item) => item.id)
    );
    const speedIds = new Set(
      params.speedEffects
        .filter((item) =>
          isTimelineTimedItemInRange(selection, "speed", item.start, item.end)
        )
        .map((item) => item.id)
    );
    const subtitleIds = new Set(
      params.subtitles
        .filter((item) =>
          isTimelineTimedItemInRange(selection, "subtitles", item.start, item.end)
        )
        .map((item) => item.id)
    );
    const textIds = new Set(
      params.textOverlays
        .filter((item) =>
          isTimelineTimedItemInRange(selection, "text", item.start, item.end)
        )
        .map((item) => item.id)
    );

    if (params.selectedTimelineSegmentIds.length > 0 || params.selectedTimelineSegmentId) {
      editing.deleteSelectedTimelineSegment();
    } else {
      params.setSelectedTimelineSegmentId(null);
      params.setSelectedTimelineSegmentIds([]);
      params.setTimelineRangeSelection(null);
    }
    if (zoomIds.size > 0) {
      params.setZoomEffects((current) => current.filter((item) => !zoomIds.has(item.id)));
    }
    if (speedIds.size > 0) {
      params.setSpeedEffects((current) => current.filter((item) => !speedIds.has(item.id)));
    }
    if (subtitleIds.size > 0) {
      params.setSubtitles((current) => current.filter((item) => !subtitleIds.has(item.id)));
    }
    if (textIds.size > 0) {
      params.setTextOverlays((current) => current.filter((item) => !textIds.has(item.id)));
    }
    params.setSelectedZoomId(null);
    params.setSelectedSpeedId(null);
    params.setSelectedSubtitleId(null);
    params.setSelectedTextOverlayId(null);
  }

  useEditorShortcuts({
    currentTime: params.currentTime,
    currentTimeRef: params.currentTimeRef,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    hasTimelineRangeSelection: Boolean(params.timelineRangeSelection),
    seek: params.seek,
    undo: editing.undoTimelineEdit,
    redo: editing.redoTimelineEdit,
    openExport: params.openExportDialog,
    copyClip: clipboard.copySelectedTimelineSegment,
    cutClip: clipboard.cutSelectedTimelineSegment,
    pasteClip: clipboard.pasteTimelineSegment,
    splitAtPlayhead: editing.splitTimelineSegment,
    togglePlayback: params.togglePlayback,
    deleteSelected: deleteSelectedTimelineItems
  });

  return {
    addSpeedEffect: effects.addSpeedEffect,
    addSubtitle: effects.addSubtitle,
    addZoomEffect: effects.addZoomEffect,
    beginSpeedClipDrag: drags.beginSpeedClipDrag,
    beginSubtitleClipDrag: drags.beginSubtitleClipDrag,
    beginTextOverlayClipDrag: drags.beginTextOverlayClipDrag,
    beginTimelineClipMove: drags.beginTimelineClipMove,
    beginTimelineClipTrim: drags.beginTimelineClipTrim,
    beginTimelineScrub: drags.beginTimelineScrub,
    beginZoomClipDrag: drags.beginZoomClipDrag,
    deleteSelectedTimelineSegment: deleteSelectedTimelineItems,
    deleteTimelineSegment: editing.deleteTimelineSegment,
    endTimelineScrub: drags.endTimelineScrub,
    cancelTranscription: subtitleGeneration.cancelTranscription,
    generateSubtitles: subtitleGeneration.generateSubtitles,
    providerKeys: subtitleGeneration.providerKeys,
    refreshProviderKeys: subtitleGeneration.refreshProviderKeys,
    sttProvider: subtitleGeneration.sttProvider,
    sttActivityRanges: subtitleGeneration.sttActivityRanges,
    updateProviderSettings: subtitleGeneration.updateProviderSettings,
    handleTimelineDragOver: editing.handleTimelineDragOver,
    handleTimelineDrop: editing.handleTimelineDrop,
    moveTimelineScrub: drags.moveTimelineScrub,
    openTimelineContextMenu: drags.openTimelineContextMenu,
    redoTimelineEdit: editing.redoTimelineEdit,
    removeSpeedEffect: effects.removeSpeedEffect,
    removeZoomEffect: effects.removeZoomEffect,
    splitTimelineSegment: editing.splitTimelineSegment,
    undoTimelineEdit: editing.undoTimelineEdit,
    sttDownloadProgress: subtitleGeneration.sttDownloadProgress,
    sttStatus: subtitleGeneration.sttStatus,
    updateSpeedEffect: effects.updateSpeedEffect,
    updateSubtitle: effects.updateSubtitle,
    updateZoomEffect: effects.updateZoomEffect
  };
}
