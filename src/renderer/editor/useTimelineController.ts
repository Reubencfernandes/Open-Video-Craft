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
 * This file contains no behavior of its own — it only routes each hook's
 * outputs into the hooks that need them (undo stacks into drags, commit into
 * clipboard, everything into shortcuts) and re-exports what the JSX uses.
 */
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { PlaybackSyncReason } from "./playback-sync";
import { useEditorEffects } from "./useEditorEffects";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useSubtitleGeneration } from "./useSubtitleGeneration";
import { useTimelineClipboard } from "./useTimelineClipboard";
import { useTimelineDragInteractions } from "./useTimelineDragInteractions";
import { useTimelineEditing } from "./useTimelineEditing";
import type {
  EditorMediaItem,
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TimelineContextMenu,
  TimelineSegment,
  ZoomEffect
} from "./types";

type UseTimelineControllerParams = {
  activeDuration: number;
  activeTool: EditorTool;
  allMedia: EditorMediaItem[];
  audioElsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  audioSources: EditorMediaItem[];
  currentTime: number;
  currentTimeRef: MutableRefObject<number>;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  isEditorStateReady: boolean;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  mediaById: Map<string, EditorMediaItem>;
  mediaDurationById: Map<string, number>;
  openExportDialog: () => void;
  playingRef: MutableRefObject<boolean>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  seekTimelinePointer: (clientX: number) => void;
  selectedItemId: string | null;
  selectedSpeedId: string | null;
  selectedTimelineItemId: string | null;
  selectedTimelineSegmentId: string | null;
  selectedZoomId: string | null;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setScrubbingTimeline: Dispatch<SetStateAction<boolean>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpeedId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSpeedEffects: Dispatch<SetStateAction<SpeedEffect[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineViewDuration: Dispatch<SetStateAction<number>>;
  setTrimRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  syncMediaToTime: (time: number, isPlaying: boolean, reason?: PlaybackSyncReason) => void;
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  timelineEditableItems: EditorMediaItem[];
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  togglePlayback: () => void;
  updateMediaDuration: (itemId: string, duration: number | null) => void;
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
    scheduleTimelinePlaybackSync: params.scheduleTimelinePlaybackSync,
    selectedItemId: params.selectedItemId,
    selectedTimelineItemId: params.selectedTimelineItemId,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    allMedia: params.allMedia,
    setSelectedItemId: params.setSelectedItemId,
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    setTimelineContextMenu: params.setTimelineContextMenu,
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
    allMedia: params.allMedia,
    audioSources: params.audioSources,
    setError: params.setError,
    setSelectedSubtitleId: params.setSelectedSubtitleId,
    setSubtitleLanguage: params.setSubtitleLanguage,
    setSubtitles: params.setSubtitles
  });

  const drags = useTimelineDragInteractions({
    currentTimeRef: params.currentTimeRef,
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
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    setSelectedZoomId: params.setSelectedZoomId,
    setSubtitles: params.setSubtitles,
    setTimelineContextMenu: params.setTimelineContextMenu,
    setTimelineRedoStack: editing.setTimelineRedoStack,
    setTimelineSegments: params.setTimelineSegments,
    setTimelineUndoStack: editing.setTimelineUndoStack,
    speedEffects: params.speedEffects,
    subtitles: params.subtitles,
    timelineBodyRef: params.timelineBodyRef,
    timelineDuration: params.timelineDuration,
    timelineRenderDuration: params.timelineRenderDuration,
    timelineSegments: params.timelineSegments,
    updateSpeedEffect: effects.updateSpeedEffect,
    updateSubtitle: effects.updateSubtitle,
    updateZoomEffect: effects.updateZoomEffect,
    zoomEffects: params.zoomEffects
  });

  const clipboard = useTimelineClipboard({
    commitTimelineSegments: editing.commitTimelineSegments,
    currentTimeRef: params.currentTimeRef,
    deleteSelectedTimelineSegment: editing.deleteSelectedTimelineSegment,
    knownTimelineItemIdsRef: params.knownTimelineItemIdsRef,
    mediaById: params.mediaById,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    setExportMessage: params.setExportMessage,
    setSelectedItemId: params.setSelectedItemId,
    setSelectedTimelineSegmentId: params.setSelectedTimelineSegmentId,
    timelineRenderDuration: params.timelineRenderDuration,
    timelineSegments: params.timelineSegments
  });

  useEditorShortcuts({
    activeTool: params.activeTool,
    currentTime: params.currentTime,
    currentTimeRef: params.currentTimeRef,
    selectedTimelineSegmentId: params.selectedTimelineSegmentId,
    selectedZoomId: params.selectedZoomId,
    selectedSpeedId: params.selectedSpeedId,
    seek: params.seek,
    undo: editing.undoTimelineEdit,
    redo: editing.redoTimelineEdit,
    openExport: params.openExportDialog,
    copyClip: clipboard.copySelectedTimelineSegment,
    cutClip: clipboard.cutSelectedTimelineSegment,
    pasteClip: clipboard.pasteTimelineSegment,
    splitAtPlayhead: editing.splitTimelineSegment,
    togglePlayback: params.togglePlayback,
    removeZoom: effects.removeZoomEffect,
    removeSpeed: effects.removeSpeedEffect,
    deleteSelected: editing.deleteSelectedTimelineSegment
  });

  return {
    addSpeedEffect: effects.addSpeedEffect,
    addSubtitle: effects.addSubtitle,
    addZoomEffect: effects.addZoomEffect,
    beginSpeedClipDrag: drags.beginSpeedClipDrag,
    beginSubtitleClipDrag: drags.beginSubtitleClipDrag,
    beginTimelineClipMove: drags.beginTimelineClipMove,
    beginTimelineClipTrim: drags.beginTimelineClipTrim,
    beginTimelineScrub: drags.beginTimelineScrub,
    beginZoomClipDrag: drags.beginZoomClipDrag,
    deleteSelectedTimelineSegment: editing.deleteSelectedTimelineSegment,
    deleteTimelineSegment: editing.deleteTimelineSegment,
    endTimelineScrub: drags.endTimelineScrub,
    generateSubtitles: subtitleGeneration.generateSubtitles,
    handleTimelineDragOver: editing.handleTimelineDragOver,
    handleTimelineDrop: editing.handleTimelineDrop,
    moveTimelineScrub: drags.moveTimelineScrub,
    openTimelineContextMenu: drags.openTimelineContextMenu,
    removeSpeedEffect: effects.removeSpeedEffect,
    removeZoomEffect: effects.removeZoomEffect,
    splitTimelineSegment: editing.splitTimelineSegment,
    sttStatus: subtitleGeneration.sttStatus,
    updateSpeedEffect: effects.updateSpeedEffect,
    updateSubtitle: effects.updateSubtitle,
    updateZoomEffect: effects.updateZoomEffect
  };
}
