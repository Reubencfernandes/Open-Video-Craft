/**
 * EditorView: the video editor window.
 *
 * This component is the orchestrator — it owns every piece of editor state
 * (media library, timeline segments, playback clock, zoom/subtitle effects,
 * layout/style settings) and all the handlers that mutate it. Rendering is
 * delegated to the small presentational components under ./editor/:
 *
 *   - panels/*        one component per left-rail tool
 *   - Timeline        the bottom timeline panel (tracks, clips, playhead)
 *   - PreviewContent  the media shown inside the preview frame
 *   - ExportDialog    the export modal
 *
 * Pure math, storage, and larger render sections live in focused modules under
 * ./editor so individual files stay easier to reason about.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type {
  ProjectView
} from "../shared/types";
import {
  constrainZoomEnd,
  constrainZoomMove,
  constrainZoomStart,
  placeZoomInFirstGap,
  zoomMinDurationSeconds
} from "./zoom-timing";
import { ExportDialog } from "./editor/ExportDialog";
import { EditorPreviewPanel } from "./editor/EditorPreviewPanel";
import { EditorTimelineSection } from "./editor/EditorTimelineSection";
import { EditorToolPanel } from "./editor/EditorToolPanel";
import { EditorTopbar } from "./editor/EditorTopbar";
import { ToolRail } from "./editor/ToolRail";
import { decodeAudioTo16kMono } from "./editor/media-utils";
import { getCameraFrameFromPreset } from "./editor/layout-geometry";
import { useEditorDerivedData } from "./editor/useEditorDerivedData";
import { useEditorExport } from "./editor/useEditorExport";
import { useEditorMediaActions } from "./editor/useEditorMediaActions";
import { useEditorPlayback } from "./editor/useEditorPlayback";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { usePreviewLayoutControls } from "./editor/usePreviewLayoutControls";
import { useTimelineViewport } from "./editor/useTimelineViewport";
import { defaultSpeedRate, speedMinDurationSeconds } from "./editor/speed-utils";
import {
  addLanguageToWhisperWordChunks,
  createSubtitleSegmentsFromWhisperOutput,
  formatSubtitleLanguage,
  getWhisperOutputLanguage,
  whisperTranscriptionModel,
  whisperTranscriptionModelLabel
} from "./editor/subtitle-transcription";
import type { WhisperTranscriptionOutput } from "./editor/subtitle-transcription";
import {
  areTimelineSegmentsEqual,
  canSplitTimelineSegment,
  canSplitTimelineSegmentAt,
  findTimelineSegmentAtTime,
  getTimelineMediaDuration,
  getTimelineTrackKind,
  moveTimelineSegment,
  resolveAudioLane,
  syncTimelineSegments,
  trimTimelineSegment
} from "./editor/timeline-utils";
import { clampNumber, createId } from "./editor/utils";
import { mediaDragType } from "./editor/types";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  MediaPanel as MediaPanelTab,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  TimelineContextMenu,
  TimelineSegment,
  TimelineTrimDrag,
  TimelineTrimEdge,
  VideoCornerStyle,
  ZoomEffect
} from "./editor/types";

function isKeyboardTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return !["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(
    target.type
  );
}

function blurFocusedShortcutControl(): void {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    activeElement.blur();
  }
}

export function EditorView() {
  const projectId = useMemo(
    () => new URLSearchParams(window.location.search).get("projectId"),
    []
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanelTab>("all");
  const [activeTool, setActiveTool] = useState<EditorTool>("layout");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("bubble");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("real-world-1");
  const [activeBackgroundCategory, setActiveBackgroundCategory] =
    useState<BackgroundCategory>("image");
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 100
  });
  const [screenAspectRatio, setScreenAspectRatio] = useState<ScreenAspectRatio>("16:9");
  const [cameraSize, setCameraSize] = useState(24);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>("bottom-right");
  const [cameraFrame, setCameraFrame] = useState<CameraFrame>(() =>
    getCameraFrameFromPreset("bottom-right", 24)
  );
  const [cameraContentTransform, setCameraContentTransform] =
    useState<CameraContentTransform>({
      x: 0,
      y: 0,
      scale: 100,
      mirrored: false
    });
  const [cameraShape, setCameraShape] = useState<CameraShape>("circle");
  const [cameraBorderStyle, setCameraBorderStyle] = useState<CameraBorderStyle>("light");
  const [videoCornerStyle, setVideoCornerStyle] = useState<VideoCornerStyle>("soft");
  const [masterVolume, setMasterVolume] = useState(100);
  const [audioLevels, setAudioLevels] = useState<
    Record<string, { volume: number; muted: boolean }>
  >({});
  const [backgroundAudioIds, setBackgroundAudioIds] = useState<string[]>([]);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [speedEffects, setSpeedEffects] = useState<SpeedEffect[]>([]);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("karaoke");
  const [sttStatus, setSttStatus] = useState<
    "idle" | "loading" | "transcribing" | "done" | "error"
  >("idle");
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedTimelineSegmentId, setSelectedTimelineSegmentId] = useState<string | null>(null);
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenu>(null);
  const [timelineUndoStack, setTimelineUndoStack] = useState<TimelineSegment[][]>([]);
  const [timelineRedoStack, setTimelineRedoStack] = useState<TimelineSegment[][]>([]);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubbingTimeline, setScrubbingTimeline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineViewDuration, setTimelineViewDuration] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);

  const timelineDragRef = useRef(false);
  const timelineTrimDragRef = useRef<TimelineTrimDrag | null>(null);
  const timelineMoveDragRef = useRef<{
    segmentId: string;
    pointerStartTime: number;
    segmentStart: number;
    moved: boolean;
    originalSegments: TimelineSegment[];
  } | null>(null);
  const zoomDragRef = useRef<{
    id: string;
    mode: "move" | "start" | "end";
    pointerStartTime: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
  } | null>(null);
  const speedDragRef = useRef<{
    id: string;
    mode: "move" | "start" | "end";
    pointerStartTime: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
  } | null>(null);
  const previousTimelineDurationRef = useRef(0);
  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());

  const { saveState } = useEditorPersistence({
    activeBackgroundCategory,
    audioLevels,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    knownTimelineItemIdsRef,
    layoutMode,
    masterVolume,
    projectId,
    screenAspectRatio,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setError,
    setExportMessage,
    setLayoutMode,
    setMasterVolume,
    setProject,
    setScreenAspectRatio,
    setScreenPosition,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTimelineSegments,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    subtitleLanguage,
    subtitleStyle,
    subtitles,
    timelineSegments,
    videoCornerStyle,
    zoomEffects
  });

  // Auto-dismiss the "Project saved" toast.
  useEffect(() => {
    if (exportMessage !== "Project saved") {
      return undefined;
    }

    const timeout = window.setTimeout(() => setExportMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [exportMessage]);

  // ---------------------------------------------------------------------------
  // Derived data: media library, timeline clips, playback geometry.
  // ---------------------------------------------------------------------------

  const {
    activeDuration,
    activeSubtitle,
    activeVideoClip,
    allMedia,
    audioSources,
    audioTimelineClips,
    audioTimelineTracks,
    cameraEditEnabled,
    cameraStyle,
    cameraVideoStyle,
    currentFrame,
    isProjectCompositionSelected,
    mediaById,
    mediaDurationById,
    playheadPercent,
    previewClassName,
    previewFrameStyle,
    previewItem,
    projectCamera,
    projectMedia,
    projectName,
    projectScreen,
    screenAspectEnabled,
    screenEditEnabled,
    screenStyle,
    selectedItem,
    selectedSubtitle,
    selectedSpeedEffect,
    selectedTimelineClip,
    selectedTimelineItemId,
    selectedZoomEffect,
    timelineDuration,
    timelineEditableItems,
    timelineRenderDuration,
    timelineVisible,
    totalFrames,
    videoTimelineClips,
    visibleMedia
  } = useEditorDerivedData({
    activePanel,
    activeTool,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    currentTime,
    customBackgroundUrl,
    duration,
    importedMedia,
    layoutMode,
    project,
    screenAspectRatio,
    screenPosition,
    selectedItemId,
    selectedSubtitleId,
    selectedTimelineSegmentId,
    selectedZoomId,
    selectedSpeedId,
    speedEffects,
    subtitles,
    timelineSegments,
    timelineViewDuration,
    videoCornerStyle,
    zoomEffects
  });

  const {
    audioElsRef,
    cameraRef,
    currentTimeRef,
    mainVideoRef,
    playingRef,
    scheduleTimelinePlaybackSync,
    seek,
    seekFrame,
    syncMediaToTime,
    togglePlayback
  } = useEditorPlayback({
    activeDuration,
    activeVideoClip,
    audioLevels,
    audioTimelineClips,
    currentTime,
    layoutMode,
    masterVolume,
    mediaById,
    playing,
    previewItem,
    projectCamera,
    setCurrentTime,
    setError,
    setPlaying,
    speedEffects,
    subtitles,
    timelineDuration,
    timelineSegments,
    totalFrames,
    zoomEffects
  });

  const {
    beginTimelinePanelResize,
    bodyRef: timelineBodyRef,
    endTimelinePanelResize,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    resetTimelinePanelHeight,
    seekTimelinePointer,
    timelinePanelHeight
  } = useTimelineViewport({
    renderDuration: timelineRenderDuration,
    seek
  });

  const {
    importCustomBackground,
    importMedia,
    removeImportedMedia,
    selectTimelineItem,
    setAudioLevel,
    updateDuration,
    updateMediaDuration
  } = useEditorMediaActions({
    knownTimelineItemIdsRef,
    projectMedia,
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
  });

  const {
    canExport,
    closeExportDialog,
    exportCurrentVideo,
    exportDialogOpen,
    exportFormat,
    exporting,
    exportResolution,
    openExportDialog,
    setExportFormat,
    setExportResolution
  } = useEditorExport({
    backgroundAudioIds,
    masterVolume,
    project,
    projectScreen,
    selectedItem,
    setError,
    setExportMessage,
    trimRange
  });

  const {
    beginCameraLayoutDrag,
    beginScreenLayoutDrag,
    resetCameraContentTransform,
    selectCameraPosition,
    selectCameraSize,
    updateCameraContentTransform
  } = usePreviewLayoutControls({
    activeTool,
    cameraEditEnabled,
    cameraFrame,
    layoutMode,
    screenEditEnabled,
    screenPosition,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraSize,
    setScreenPosition
  });

  useEffect(() => {
    if (!selectedItemId && allMedia.length > 0) {
      setSelectedItemId(allMedia[0].id);
    }
  }, [allMedia, selectedItemId]);

  // Keep timeline segments consistent with the media library.
  useEffect(() => {
    const availableItemIds = new Set(timelineEditableItems.map((item) => item.id));
    const nextKnownItemIds = new Set(
      [...knownTimelineItemIdsRef.current].filter((itemId) => availableItemIds.has(itemId))
    );
    // Only project recordings load onto the timeline automatically; imported
    // media stays in the asset grid until it is dragged onto the timeline.
    const newItemIds = new Set(
      timelineEditableItems
        .filter((item) => item.origin === "project")
        .map((item) => item.id)
        .filter((itemId) => !nextKnownItemIds.has(itemId))
    );

    for (const itemId of newItemIds) {
      nextKnownItemIds.add(itemId);
    }
    knownTimelineItemIdsRef.current = nextKnownItemIds;

    setTimelineSegments((current) =>
      syncTimelineSegments(
        current,
        timelineEditableItems,
        mediaDurationById,
        newItemIds
      )
    );
    setSelectedTimelineSegmentId((current) =>
      current && availableItemIds.has(current.split(":segment-")[0]) ? current : null
    );
  }, [mediaDurationById, timelineEditableItems]);

  // Probe durations for media whose length is still unknown (throwaway
  // elements; the real duration lands in the library via updateMediaDuration).
  useEffect(() => {
    const unresolvedMedia = timelineEditableItems.filter(
      (item) => item.kind !== "image" && (!item.duration || item.duration <= 0)
    );
    if (unresolvedMedia.length === 0) {
      return undefined;
    }

    const cleanups = unresolvedMedia.map((item) => {
      const element = document.createElement(item.kind === "audio" ? "audio" : "video");
      const reportDuration = () => updateMediaDuration(item.id, element.duration);
      element.preload = "metadata";
      element.addEventListener("loadedmetadata", reportDuration);
      element.addEventListener("durationchange", reportDuration);
      element.src = item.url;
      element.load();

      return () => {
        element.removeEventListener("loadedmetadata", reportDuration);
        element.removeEventListener("durationchange", reportDuration);
        element.removeAttribute("src");
        element.load();
      };
    });

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [timelineEditableItems]);

  // Grow (never shrink) the rendered timeline scale as content grows.
  useEffect(() => {
    setTimelineViewDuration((current) => Math.max(current, timelineDuration));
  }, [timelineDuration]);

  // Keep the export trim range sensible as the timeline duration changes.
  useEffect(() => {
    if (timelineDuration <= 0) {
      return;
    }

    const previousTimelineDuration = previousTimelineDurationRef.current;
    setTrimRange((current) => {
      const shouldUseFullDuration =
        current.end <= 0 ||
        Math.abs(current.end - previousTimelineDuration) < 0.05 ||
        (previousTimelineDuration <= 1.05 && current.end <= 1.05 && timelineDuration > 1.05);
      const start = Math.min(current.start, timelineDuration);
      const end = shouldUseFullDuration
        ? timelineDuration
        : Math.min(Math.max(current.end, start + 0.1), timelineDuration);

      return {
        start,
        end
      };
    });
    previousTimelineDurationRef.current = timelineDuration;
  }, [timelineDuration]);

  // Global keyboard shortcuts: play/pause, delete, undo/redo.
  useEffect(() => {
    function handleTimelineKeyDown(event: KeyboardEvent) {
      const isTyping = isKeyboardTextTarget(event.target);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoTimelineEdit();
          return;
        }

        undoTimelineEdit();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoTimelineEdit();
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) {
          return;
        }

        blurFocusedShortcutControl();
        void togglePlayback();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (activeTool === "zoom" && selectedZoomId) {
          removeZoomEffect(selectedZoomId);
          return;
        }

        if (activeTool === "speed" && selectedSpeedId) {
          removeSpeedEffect(selectedSpeedId);
          return;
        }

        deleteSelectedTimelineSegment();
      }
    }

    window.addEventListener("keydown", handleTimelineKeyDown);
    return () => window.removeEventListener("keydown", handleTimelineKeyDown);
  }, [
    currentTime,
    activeTool,
    masterVolume,
    isProjectCompositionSelected,
    playing,
    selectedItem?.id,
    selectedTimelineSegmentId,
    selectedSpeedId,
    selectedZoomId,
    timelineRedoStack,
    timelineSegments,
    timelineUndoStack
  ]);

  // ---------------------------------------------------------------------------
  // Drag & drop from the asset grid onto the timeline.
  // ---------------------------------------------------------------------------

  function handleTimelineDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes(mediaDragType)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleTimelineDrop(event: ReactDragEvent<HTMLDivElement>) {
    const itemId = event.dataTransfer.getData(mediaDragType);
    const item = itemId ? mediaById.get(itemId) : null;
    const dropTime = getTimelineTimeFromClientX(event.clientX);
    if (!item || dropTime === null) {
      return;
    }

    event.preventDefault();
    addTimelineClipAt(item, dropTime);
  }

  // Adds a new clip for the media item at the drop position. The same asset
  // can be dropped multiple times to build a multi-clip sequence.
  function addTimelineClipAt(item: EditorMediaItem, dropTime: number) {
    if (item.track === "camera") {
      return;
    }

    const track = getTimelineTrackKind(item);
    const itemDuration = Math.max(
      0.1,
      mediaDurationById.get(item.id) ??
      getTimelineMediaDuration(item, activeDuration, selectedTimelineItemId)
    );
    const start = Math.max(0, dropTime);
    const end = start + itemDuration;
    // The "itemId:segment-" id format is load-bearing: selection code maps a
    // segment back to its media item by splitting on ":segment-".
    const segmentId = `${item.id}:segment-${createId("drop")}`;

    knownTimelineItemIdsRef.current.add(item.id);
    commitTimelineSegments((segments) => {
      const draft: TimelineSegment = {
        id: segmentId,
        itemId: item.id,
        track,
        lane: track === "audio" ? resolveAudioLane(segments, segmentId, start, end, 0) : 0,
        start,
        end,
        sourceStart: 0
      };
      // Route through the move logic so drops snap to clip edges like drags do.
      return moveTimelineSegment([...segments, draft], segmentId, start, timelineRenderDuration);
    });
    setSelectedItemId(item.id);
    setSelectedTimelineSegmentId(segmentId);
  }

  // ---------------------------------------------------------------------------
  // Timeline editing: commit (with undo), trim, move, split, delete, scrub.
  // ---------------------------------------------------------------------------

  // All segment edits flow through here so each change lands on the undo stack.
  function commitTimelineSegments(updater: (segments: TimelineSegment[]) => TimelineSegment[]) {
    setTimelineSegments((current) => {
      const next = updater(current);
      if (areTimelineSegmentsEqual(current, next)) {
        return current;
      }

      scheduleTimelinePlaybackSync(next);
      setTimelineUndoStack((stack) => [...stack.slice(-49), current]);
      setTimelineRedoStack([]);
      return next;
    });
  }

  function undoTimelineEdit() {
    if (timelineUndoStack.length === 0) {
      return;
    }

    const previous = timelineUndoStack[timelineUndoStack.length - 1];
    setTimelineUndoStack((stack) => stack.slice(0, -1));
    setTimelineRedoStack((stack) => [timelineSegments, ...stack.slice(0, 49)]);
    scheduleTimelinePlaybackSync(previous);
    setTimelineSegments(previous);
    setSelectedTimelineSegmentId(null);
  }

  function redoTimelineEdit() {
    if (timelineRedoStack.length === 0) {
      return;
    }

    const next = timelineRedoStack[0];
    setTimelineRedoStack((stack) => stack.slice(1));
    setTimelineUndoStack((stack) => [...stack.slice(-49), timelineSegments]);
    scheduleTimelinePlaybackSync(next);
    setTimelineSegments(next);
    setSelectedTimelineSegmentId(null);
  }

  function deleteTimelineSegment(segmentId: string | null) {
    if (!segmentId) {
      return;
    }

    const audioElement = audioElsRef.current.get(segmentId);
    audioElement?.pause();
    commitTimelineSegments((segments) => segments.filter((segment) => segment.id !== segmentId));
    setSelectedTimelineSegmentId((current) => (current === segmentId ? null : current));
    setTimelineContextMenu(null);
  }

  function deleteSelectedTimelineSegment() {
    deleteTimelineSegment(selectedTimelineSegmentId);
  }

  function splitTimelineSegment(segmentId: string | null, time: number) {
    const targetSegment =
      (segmentId ? timelineSegments.find((segment) => segment.id === segmentId) : null) ??
      findTimelineSegmentAtTime(timelineSegments, time);

    if (!targetSegment || !canSplitTimelineSegment(targetSegment, time)) {
      setTimelineContextMenu(null);
      return;
    }

    const splitTime = clampNumber(time, targetSegment.start + 0.1, targetSegment.end - 0.1);
    const nextSegmentId = `${targetSegment.id}-split-${Date.now()}`;

    commitTimelineSegments((segments) =>
      segments.flatMap((segment) => {
        if (segment.id !== targetSegment.id) {
          return [segment];
        }

        return [
          {
            ...segment,
            end: splitTime
          },
          {
            ...segment,
            id: nextSegmentId,
            start: splitTime,
            sourceStart: segment.sourceStart + (splitTime - segment.start)
          }
        ];
      })
    );
    setSelectedTimelineSegmentId(nextSegmentId);
    setTimelineContextMenu(null);
  }

  function openTimelineContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const time = getTimelineTimeFromClientX(event.clientX);
    if (time === null) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const targetSegmentId =
      target?.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId ??
      findTimelineSegmentAtTime(timelineSegments, time)?.id ??
      null;

    if (targetSegmentId) {
      setSelectedTimelineSegmentId(targetSegmentId);
      const targetSegment = timelineSegments.find((segment) => segment.id === targetSegmentId);
      if (targetSegment) {
        setSelectedItemId(targetSegment.itemId);
      }
    }

    setTimelineContextMenu({
      x: event.clientX,
      y: event.clientY,
      time,
      segmentId: targetSegmentId
    });
  }

  function beginTimelineClipTrim(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) {
    event.preventDefault();
    event.stopPropagation();
    timelineTrimDragRef.current = {
      segmentId,
      edge,
      originalSegments: timelineSegments
    };
    setSelectedTimelineSegmentId(segmentId);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipTrim(clientX: number) {
    const drag = timelineTrimDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    setTimelineSegments((current) => {
      const next = trimTimelineSegment(current, drag.segmentId, drag.edge, time, mediaDurationById);
      if (!areTimelineSegmentsEqual(current, next)) {
        scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
  }

  // Trims mutate live during the drag; push a single undo entry at the end.
  function finishTimelineClipTrim() {
    const drag = timelineTrimDragRef.current;
    if (!drag) {
      return;
    }

    setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        setTimelineRedoStack([]);
      }

      return current;
    });
    timelineTrimDragRef.current = null;
  }

  function beginTimelineClipMove(event: ReactPointerEvent<HTMLElement>, segmentId: string) {
    if (timelineTrimDragRef.current) {
      return;
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const segment = timelineSegments.find((item) => item.id === segmentId);
    if (time === null || !segment) {
      return;
    }

    timelineMoveDragRef.current = {
      segmentId,
      pointerStartTime: time,
      segmentStart: segment.start,
      moved: false,
      originalSegments: timelineSegments
    };
    setSelectedTimelineSegmentId(segmentId);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipMove(clientX: number) {
    const drag = timelineMoveDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    // Ignore sub-frame jitters so a plain click doesn't count as a move.
    const delta = time - drag.pointerStartTime;
    if (!drag.moved && Math.abs(delta) < 0.02) {
      return;
    }

    drag.moved = true;
    const rawStart = Math.max(0, drag.segmentStart + delta);
    setTimelineSegments((current) => {
      const next = moveTimelineSegment(current, drag.segmentId, rawStart, timelineRenderDuration);
      if (!areTimelineSegmentsEqual(current, next)) {
        scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
  }

  function finishTimelineClipMove() {
    const drag = timelineMoveDragRef.current;
    if (!drag) {
      return;
    }

    timelineMoveDragRef.current = null;
    if (!drag.moved) {
      return;
    }

    setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        setTimelineRedoStack([]);
      }

      return current;
    });
  }

  function beginZoomClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const effect = zoomEffects.find((item) => item.id === id);
    if (time === null || !effect) {
      return;
    }

    zoomDragRef.current = {
      id,
      mode,
      pointerStartTime: time,
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    setSelectedZoomId(id);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateZoomClipDrag(clientX: number) {
    const drag = zoomDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    if (drag.mode === "move") {
      const delta = time - drag.pointerStartTime;
      if (!drag.moved && Math.abs(delta) < 0.02) {
        return;
      }
      drag.moved = true;
      const constrained = constrainZoomMove(
        zoomEffects,
        drag.id,
        drag.origStart + delta,
        timelineDuration
      );
      if (constrained) {
        updateZoomEffect(drag.id, constrained);
      }
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(zoomEffects, drag.id, time);
      if (constrained) {
        updateZoomEffect(drag.id, constrained);
      }
      return;
    }

    const constrained = constrainZoomEnd(zoomEffects, drag.id, time, timelineDuration);
    if (constrained) {
      updateZoomEffect(drag.id, constrained);
    }
  }

  function finishZoomClipDrag() {
    zoomDragRef.current = null;
  }

  function beginSpeedClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const effect = speedEffects.find((item) => item.id === id);
    if (time === null || !effect) {
      return;
    }

    speedDragRef.current = {
      id,
      mode,
      pointerStartTime: time,
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    setSelectedSpeedId(id);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateSpeedClipDrag(clientX: number) {
    const drag = speedDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    if (drag.mode === "move") {
      const delta = time - drag.pointerStartTime;
      if (!drag.moved && Math.abs(delta) < 0.02) {
        return;
      }
      drag.moved = true;
      const constrained = constrainZoomMove(
        speedEffects,
        drag.id,
        drag.origStart + delta,
        timelineDuration
      );
      if (constrained) {
        updateSpeedEffect(drag.id, constrained);
      }
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(speedEffects, drag.id, time);
      if (constrained) {
        updateSpeedEffect(drag.id, constrained);
      }
      return;
    }

    const constrained = constrainZoomEnd(speedEffects, drag.id, time, timelineDuration);
    if (constrained) {
      updateSpeedEffect(drag.id, constrained);
    }
  }

  function finishSpeedClipDrag() {
    speedDragRef.current = null;
  }

  // Pointer handlers on the timeline body dispatch to whichever drag is active
  // (trim / zoom / move) and otherwise treat the pointer as a playhead scrub.
  function beginTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      timelineTrimDragRef.current ||
      timelineMoveDragRef.current ||
      zoomDragRef.current ||
      speedDragRef.current
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input, select, textarea")) {
      return;
    }

    setTimelineContextMenu(null);
    timelineDragRef.current = true;
    setScrubbingTimeline(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTimelinePointer(event.clientX);
  }

  function moveTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (timelineTrimDragRef.current) {
      updateTimelineClipTrim(event.clientX);
      return;
    }

    if (zoomDragRef.current) {
      updateZoomClipDrag(event.clientX);
      return;
    }

    if (speedDragRef.current) {
      updateSpeedClipDrag(event.clientX);
      return;
    }

    if (timelineMoveDragRef.current) {
      updateTimelineClipMove(event.clientX);
      return;
    }

    if (!timelineDragRef.current) {
      return;
    }

    seekTimelinePointer(event.clientX);
  }

  function endTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishTimelineClipTrim();
    finishTimelineClipMove();
    finishZoomClipDrag();
    finishSpeedClipDrag();
    timelineDragRef.current = false;
    setScrubbingTimeline(false);
  }

  // ---------------------------------------------------------------------------
  // Zoom effects, subtitles, audio levels.
  // ---------------------------------------------------------------------------

  function addZoomEffect() {
    const start = currentTime;
    const desiredDuration = Math.min(
      2.5,
      Math.max(zoomMinDurationSeconds, timelineDuration - start)
    );
    const placement =
      placeZoomInFirstGap(zoomEffects, start, desiredDuration, timelineDuration) ??
      placeZoomInFirstGap(zoomEffects, start, zoomMinDurationSeconds, timelineDuration);

    if (!placement) {
      setError("There is no room for another zoom after the playhead.");
      return;
    }

    const nextEffect: ZoomEffect = {
      id: createId("zoom"),
      start: placement.start,
      end: placement.end,
      speed: "medium",
      scale: 1.5,
      targetX: 50,
      targetY: 50
    };
    setError(null);
    setZoomEffects((current) => [...current, nextEffect]);
    setSelectedZoomId(nextEffect.id);
    setActiveTool("zoom");
  }

  function updateZoomEffect(id: string, updates: Partial<ZoomEffect>) {
    setZoomEffects((current) =>
      current.map((effect) => (effect.id === id ? { ...effect, ...updates } : effect))
    );
  }

  function removeZoomEffect(id: string) {
    setZoomEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedZoomId((current) => (current === id ? null : current));
  }

  function addSpeedEffect() {
    const start = currentTime;
    const desiredDuration = Math.min(
      2.5,
      Math.max(speedMinDurationSeconds, timelineDuration - start)
    );
    const placement =
      placeZoomInFirstGap(speedEffects, start, desiredDuration, timelineDuration) ??
      placeZoomInFirstGap(speedEffects, start, speedMinDurationSeconds, timelineDuration);

    if (!placement) {
      setError("There is no room for another speed section after the playhead.");
      return;
    }

    const nextEffect: SpeedEffect = {
      id: createId("speed"),
      start: placement.start,
      end: placement.end,
      rate: defaultSpeedRate
    };
    setError(null);
    setSpeedEffects((current) => [...current, nextEffect]);
    setSelectedSpeedId(nextEffect.id);
    setActiveTool("speed");
  }

  function updateSpeedEffect(id: string, updates: Partial<SpeedEffect>) {
    setSpeedEffects((current) => {
      const constrainedStart =
        typeof updates.start === "number"
          ? constrainZoomStart(current, id, updates.start)
          : null;
      const constrainedEnd =
        typeof updates.end === "number"
          ? constrainZoomEnd(current, id, updates.end, timelineDuration)
          : null;
      const nextUpdates = {
        ...updates,
        ...(constrainedStart ?? {}),
        ...(constrainedEnd ?? {})
      };

      return current.map((effect) =>
        effect.id === id ? { ...effect, ...nextUpdates } : effect
      );
    });
    syncMediaToTime(currentTimeRef.current, playingRef.current, "clip-change");
  }

  function removeSpeedEffect(id: string) {
    setSpeedEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedSpeedId((current) => (current === id ? null : current));
    syncMediaToTime(currentTimeRef.current, playingRef.current, "clip-change");
  }

  function addSubtitle() {
    const start = currentTime;
    const end = activeDuration > 0 ? Math.min(activeDuration, start + 3) : start + 3;
    const nextSubtitle: SubtitleSegment = {
      id: createId("subtitle"),
      start,
      end: Math.max(start + 0.5, end),
      text: "New subtitle"
    };
    setSubtitles((current) => [...current, nextSubtitle]);
    setSelectedSubtitleId(nextSubtitle.id);
    setActiveTool("subtitles");
  }

  // On-device speech-to-text (Whisper via transformers.js). Loaded lazily and
  // only when the user asks for it, so the model download/compute never happens
  // automatically and never affects the rest of the app if it fails.
  async function generateSubtitles() {
    const source =
      audioSources[0] ?? allMedia.find((item) => item.kind === "video") ?? null;
    if (!source) {
      setError("Add audio or a video with speech before generating subtitles.");
      return;
    }

    setError(null);
    setSttStatus("loading");

    try {
      const transformers = await import("@xenova/transformers");
      transformers.env.allowLocalModels = false;

      const audio = await decodeAudioTo16kMono(source.url);
      setSttStatus("transcribing");

      const transcriber = (await transformers.pipeline(
        "automatic-speech-recognition",
        whisperTranscriptionModel
      )) as unknown as (
        input: Float32Array,
        options: Record<string, unknown>
      ) => Promise<WhisperTranscriptionOutput>;
      addLanguageToWhisperWordChunks(transcriber);

      const output = await transcriber(audio, {
        return_timestamps: "word",
        chunk_length_s: 30,
        stride_length_s: 5
      });

      const segments = createSubtitleSegmentsFromWhisperOutput(output);

      if (segments.length > 0) {
        setSubtitleLanguage(getWhisperOutputLanguage(output));
        setSubtitles(segments);
        setSelectedSubtitleId(segments[0].id);
      } else {
        setSubtitleLanguage(null);
        setError("No speech was detected in the audio.");
      }
      setSttStatus("done");
    } catch (sttError) {
      const message = sttError instanceof Error ? sttError.message : String(sttError);
      setError(`Speech-to-text failed: ${message}`);
      setSttStatus("error");
    }
  }

  function updateSubtitle(id: string, updates: Partial<SubtitleSegment>) {
    const nextUpdates = "text" in updates ? { ...updates, words: undefined } : updates;
    setSubtitles((current) =>
      current.map((subtitle) => (subtitle.id === id ? { ...subtitle, ...nextUpdates } : subtitle))
    );
  }

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  return (
    <main className="grid h-screen min-h-screen overflow-hidden bg-[#121317] p-0 text-[#f7f7f8]">
      <section
        className="grid h-screen w-screen min-h-0 overflow-hidden bg-[#121317]"
        style={{
          gridTemplateRows: timelineVisible
            ? `auto minmax(0, 1fr) ${timelinePanelHeight}px`
            : "auto minmax(0, 1fr)"
        }}
      >
        <EditorTopbar
          projectName={projectName}
          exporting={exporting}
          canExport={canExport}
          onBackHome={() => void window.openVideoCraft.windows.openMain()}
          onSave={saveState}
          onOpenExport={openExportDialog}
        />

        {exportDialogOpen ? (
          <ExportDialog
            exportFormat={exportFormat}
            exportResolution={exportResolution}
            exporting={exporting}
            onClose={closeExportDialog}
            onExport={() => void exportCurrentVideo()}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
          />
        ) : null}

        {error ? (
          <div
            className="fixed right-[1.1rem] top-[4.4rem] z-40 min-h-[2.35rem] w-[min(34rem,calc(100vw-2rem))] truncate rounded-lg border border-red-400/35 bg-red-950/70 px-4 py-3 text-sm font-extrabold text-red-50 shadow-[0_18px_42px_rgb(0_0_0_/_0.35)]"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        {exportMessage ? (
          <div
            className="fixed right-[1.1rem] top-[4.4rem] z-40 flex min-h-[2.35rem] w-[min(28rem,calc(100vw-2rem))] items-center truncate rounded-lg border border-green-500/30 bg-green-800/35 px-3 py-2 text-sm font-extrabold text-green-100 shadow-[0_18px_42px_rgb(0_0_0_/_0.35)]"
            role="status"
            aria-live="polite"
          >
            {exportMessage}
          </div>
        ) : null}

        <div className="grid min-h-0 grid-cols-[86px_324px_minmax(0,1fr)] gap-[0.9rem] px-[1.1rem] py-[0.9rem]">
          <ToolRail activeTool={activeTool} onToolChange={setActiveTool} />

          <EditorToolPanel
            activeTool={activeTool}
            activePanel={activePanel}
            visibleMedia={visibleMedia}
            selectedItemId={selectedItem?.id ?? null}
            layoutMode={layoutMode}
            screenScale={screenPosition.scale}
            screenAspectRatio={screenAspectRatio}
            screenAspectEnabled={screenAspectEnabled}
            cameraShape={cameraShape}
            cameraBorderStyle={cameraBorderStyle}
            cameraContentTransform={cameraContentTransform}
            cameraPosition={cameraPosition}
            cameraSize={cameraSize}
            masterVolume={masterVolume}
            audioSources={audioSources}
            audioLevels={audioLevels}
            previewItem={previewItem}
            selectedZoomEffect={selectedZoomEffect}
            selectedSpeedEffect={selectedSpeedEffect}
            sttStatus={sttStatus}
            sttModelLabel={whisperTranscriptionModelLabel}
            subtitleLanguage={formatSubtitleLanguage(subtitleLanguage)}
            subtitleStyle={subtitleStyle}
            subtitles={subtitles}
            selectedSubtitle={selectedSubtitle}
            selectedClip={selectedTimelineClip}
            activeBackgroundCategory={activeBackgroundCategory}
            backgroundStyle={backgroundStyle}
            videoCornerStyle={videoCornerStyle}
            onImportMedia={() => void importMedia()}
            onTabChange={setActivePanel}
            onSelectItem={selectTimelineItem}
            onItemDuration={updateMediaDuration}
            onRemoveItem={removeImportedMedia}
            onLayoutModeChange={setLayoutMode}
            onScreenScaleChange={(scale) =>
              setScreenPosition((current) => ({ ...current, scale }))
            }
            onScreenAspectRatioChange={setScreenAspectRatio}
            onCameraShapeChange={setCameraShape}
            onCameraBorderStyleChange={setCameraBorderStyle}
            onCameraContentTransformChange={updateCameraContentTransform}
            onCameraContentTransformReset={resetCameraContentTransform}
            onCameraPositionChange={selectCameraPosition}
            onCameraSizeChange={selectCameraSize}
            onMasterVolumeChange={setMasterVolume}
            onAddBackgroundMusic={() =>
              void importMedia({ backgroundAudio: true, selectFirst: false })
            }
            onSetAudioLevel={setAudioLevel}
            onAddZoom={addZoomEffect}
            onUpdateZoom={updateZoomEffect}
            onRemoveZoom={removeZoomEffect}
            onAddSpeed={addSpeedEffect}
            onUpdateSpeed={updateSpeedEffect}
            onRemoveSpeed={removeSpeedEffect}
            onAddSubtitle={addSubtitle}
            onGenerateSubtitles={() => void generateSubtitles()}
            onSubtitleStyleChange={setSubtitleStyle}
            onUpdateSubtitle={updateSubtitle}
            onSelectSubtitle={setSelectedSubtitleId}
            onSplitAtPlayhead={() =>
              splitTimelineSegment(selectedTimelineSegmentId, currentTime)
            }
            onDeleteSelected={deleteSelectedTimelineSegment}
            onBackgroundCategoryChange={setActiveBackgroundCategory}
            onBackgroundStyleChange={setBackgroundStyle}
            onUploadCustomBackground={() => void importCustomBackground()}
            onCornerStyleChange={setVideoCornerStyle}
          />

          <EditorPreviewPanel
            previewClassName={previewClassName}
            previewFrameStyle={previewFrameStyle}
            previewZoom={previewZoom}
            previewItem={previewItem}
            videoTimelineClips={videoTimelineClips}
            audioTimelineClips={audioTimelineClips}
            isProjectCompositionSelected={isProjectCompositionSelected}
            projectCamera={projectCamera}
            layoutMode={layoutMode}
            screenStyle={screenStyle}
            cameraStyle={cameraStyle}
            cameraVideoStyle={cameraVideoStyle}
            screenEditEnabled={screenEditEnabled}
            cameraEditEnabled={cameraEditEnabled}
            activeSubtitle={activeSubtitle}
            subtitleStyle={subtitleStyle}
            currentTime={currentTime}
            mainVideoRef={mainVideoRef}
            cameraRef={cameraRef}
            audioElsRef={audioElsRef}
            onScreenEditPointerDown={beginScreenLayoutDrag}
            onCameraEditPointerDown={beginCameraLayoutDrag}
            onMediaReady={() =>
              syncMediaToTime(currentTimeRef.current, playingRef.current, "media-ready")
            }
            onDuration={updateDuration}
            onMediaDuration={updateMediaDuration}
            onPreviewZoomChange={(zoom) => setPreviewZoom(clampNumber(zoom, 0.65, 1.6))}
            onSubtitleClick={(subtitleId) => {
              setSelectedSubtitleId(subtitleId);
              setActiveTool("subtitles");
            }}
          />
        </div>

        <EditorTimelineSection
          visible={timelineVisible}
          bodyRef={timelineBodyRef}
          onResizePointerDown={beginTimelinePanelResize}
          onResizePointerMove={moveTimelinePanelResize}
          onResizePointerUp={endTimelinePanelResize}
          onResizeDoubleClick={resetTimelinePanelHeight}
          activeTool={activeTool}
          playing={playing}
          scrubbing={scrubbingTimeline}
          currentTime={currentTime}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          playheadPercent={playheadPercent}
          renderDuration={timelineRenderDuration}
          videoClips={videoTimelineClips}
          audioTracks={audioTimelineTracks}
          zoomEffects={zoomEffects}
          speedEffects={speedEffects}
          subtitles={subtitles}
          selectedSegmentId={selectedTimelineSegmentId}
          selectedZoomId={selectedZoomEffect?.id ?? null}
          selectedSpeedId={selectedSpeedEffect?.id ?? null}
          selectedSubtitleId={selectedSubtitle?.id ?? null}
          contextMenu={timelineContextMenu}
          canSplitAtContextMenu={
            timelineContextMenu
              ? canSplitTimelineSegmentAt(timelineSegments, timelineContextMenu)
              : false
          }
          onTogglePlayback={() => void togglePlayback()}
          onSeekFrame={seekFrame}
          onSelectClip={(clip) => {
            setSelectedItemId(clip.item.id);
            setSelectedTimelineSegmentId(clip.id);
          }}
          onSelectZoom={(effect) => {
            setSelectedZoomId(effect.id);
            setActiveTool("zoom");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectSpeed={(effect) => {
            setSelectedSpeedId(effect.id);
            setActiveTool("speed");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectSubtitle={(subtitleId) => {
            setSelectedSubtitleId(subtitleId);
            setActiveTool("subtitles");
          }}
          onTrimPointerDown={beginTimelineClipTrim}
          onMovePointerDown={beginTimelineClipMove}
          onZoomDragPointerDown={beginZoomClipDrag}
          onSpeedDragPointerDown={beginSpeedClipDrag}
          onBodyPointerDown={beginTimelineScrub}
          onBodyPointerMove={moveTimelineScrub}
          onBodyPointerUp={endTimelineScrub}
          onBodyContextMenu={openTimelineContextMenu}
          onBodyDragOver={handleTimelineDragOver}
          onBodyDrop={handleTimelineDrop}
          onContextMenuSplit={() => {
            if (timelineContextMenu) {
              splitTimelineSegment(timelineContextMenu.segmentId, timelineContextMenu.time);
            }
          }}
          onContextMenuDelete={() => {
            if (timelineContextMenu) {
              deleteTimelineSegment(timelineContextMenu.segmentId);
            }
          }}
        />
      </section>
    </main>
  );
}
