/**
 * EditorView: the video editor window's composition root.
 *
 * This component intentionally contains no editing logic. It does three
 * things only:
 *
 *   1. Declares the editor's shared state (media library, timeline segments,
 *      effects, layout/style settings, selection).
 *   2. Wires that state into the focused hooks under ./editor/ that implement
 *      every behavior — persistence, derived view data, playback, viewport,
 *      media actions, export, preview layout, and the timeline controller
 *      facade (editing, drags, clipboard, effects, transcription, shortcuts).
 *   3. Renders the layout from the presentational components under ./editor/
 *      (ToolRail, EditorToolPanel, EditorPreviewPanel, EditorTimelineSection,
 *      ExportDialog, notifications).
 *
 */
import { useEffect, useRef, useState } from "react";
import type {
  ProjectView
} from "../shared/types";
import { AiConnectionDialog } from "./editor/AiConnectionDialog";
import { ExportDialog } from "./editor/ExportDialog";
import { EditorNotifications } from "./editor/EditorNotifications";
import { UpdateNotification } from "./notifications/UpdateNotification";
import { EditorPreviewPanel } from "./editor/EditorPreviewPanel";
import { EditorTimelineSection } from "./editor/EditorTimelineSection";
import { EditorToolPanel } from "./editor/EditorToolPanel";
import { EditorTopbar } from "./editor/EditorTopbar";
import { ToolRail } from "./editor/ToolRail";
import { WorkspaceResizeHandle } from "./editor/WorkspaceResizeHandle";
import { getCameraFrameFromPreset } from "./editor/layout-geometry";
import { MediaPanel } from "./editor/panels/MediaPanel";
import { useEditorDerivedData } from "./editor/useEditorDerivedData";
import { useEditorExport } from "./editor/useEditorExport";
import { useEditorMediaActions } from "./editor/useEditorMediaActions";
import { useGeminiChat } from "./editor/useGeminiChat";
import { useMusicGeneration } from "./editor/useMusicGeneration";
import { useEditorPlayback } from "./editor/useEditorPlayback";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { usePreviewQuality } from "./editor/usePreviewQuality";
import { usePreviewLayoutControls } from "./editor/usePreviewLayoutControls";
import { useTimelineController } from "./editor/useTimelineController";
import { useTimelineViewport } from "./editor/useTimelineViewport";
import { useWorkspacePanelResize } from "./editor/useWorkspacePanelResize";
import { useAppUpdateStatus } from "./useAppUpdateStatus";
import {
  formatSubtitleLanguage,
  whisperTranscriptionModelLabel
} from "./editor/subtitle-transcription";
import { canSplitTimelineSegmentAt, findSplittableTimelineSegment } from "./editor/timeline-utils";
import { clampNumber, createId } from "./editor/utils";
import { getZoomPreviewTime } from "./editor/zoom-utils";
import { sanitizeClipTransitions, validateClipTransitions } from "../shared/editor-domain";
import type {
  PendingMediaImport,
  PendingMusicGeneration
} from "../shared/editor-domain";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  ClipTransition,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  MediaPanel as MediaPanelTab,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  TextOverlay,
  TimelineContextMenu,
  TimelineRangeSelection,
  TimelineSegment,
  VideoCornerStyle,
  ZoomEffect
} from "./editor/types";

export function EditorView() {
  const [projectId, setProjectId] = useState(() =>
    new URLSearchParams(window.location.search).get("projectId")
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  // Name the user typed for a not-yet-created edit; applied when the project is
  // first saved to disk. Once a project exists, renames persist immediately.
  const [pendingProjectName, setPendingProjectName] = useState("");
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanelTab>("all");
  const [activeTool, setActiveTool] = useState<EditorTool>("media");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("bubble");
  // New compositions start on the warm Ember background so the canvas matches
  // the editor's neutral/amber palette; saved projects keep their own choice.
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("real-world-6");
  const [activeBackgroundCategory, setActiveBackgroundCategory] =
    useState<BackgroundCategory>("image");
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [customBackgroundImportId, setCustomBackgroundImportId] = useState<string | null>(null);
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 100
  });
  const [screenAspectRatio, setScreenAspectRatio] = useState<ScreenAspectRatio>("auto");
  const [screenMediaAspect, setScreenMediaAspect] = useState<number | null>(null);
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
  const [zoomPreviewTime, setZoomPreviewTime] = useState<number | null>(null);
  const [speedEffects, setSpeedEffects] = useState<SpeedEffect[]>([]);
  const [transitions, setTransitions] = useState<ClipTransition[]>([]);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextOverlayId, setSelectedTextOverlayId] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("karaoke");
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedTimelineSegmentId, setSelectedTimelineSegmentId] = useState<string | null>(null);
  const [selectedTimelineSegmentIds, setSelectedTimelineSegmentIds] = useState<string[]>([]);
  const [timelineRangeSelection, setTimelineRangeSelection] =
    useState<TimelineRangeSelection | null>(null);
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenu>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubbingTimeline, setScrubbingTimeline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineViewDuration, setTimelineViewDuration] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(1);
  const { quality: previewQuality, setQuality: setPreviewQuality } = usePreviewQuality();
  const [pendingMediaImport, setPendingMediaImport] =
    useState<PendingMediaImport | null>(null);
  const [pendingMusicGeneration, setPendingMusicGeneration] =
    useState<PendingMusicGeneration | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const { updateStatus, installUpdate } = useAppUpdateStatus();

  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());

  const {
    allowUnload,
    hasUnsavedChanges,
    isReady: isEditorStateReady,
    lastAgentEdit,
    saveState,
    undoLastAgentEdit
  } = useEditorPersistence({
    activeBackgroundCategory,
    audioLevels,
    backgroundAudioIds,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    customBackgroundImportId,
    importedMedia,
    knownTimelineItemIdsRef,
    layoutMode,
    masterVolume,
    pendingMediaImport,
    pendingMusicGeneration,
    onProjectCreated: (nextProjectId) => {
      setProjectId(nextProjectId);
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", nextProjectId);
      window.history.replaceState(null, "", url);
    },
    pendingProjectName,
    project,
    projectId,
    previewQuality,
    previewZoom,
    screenAspectRatio,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setCustomBackgroundImportId,
    setError,
    setExportMessage,
    setImportedMedia,
    setLayoutMode,
    setMasterVolume,
    setPendingMediaImport,
    setPendingMusicGeneration,
    setPreviewQuality,
    setPreviewZoom,
    setProject,
    setScreenAspectRatio,
    setScreenPosition,
    setSpeedEffects,
    setTransitions,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTextOverlays,
    setTimelineSegments,
    setTimelineZoom,
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    transitions,
    subtitleLanguage,
    subtitleStyle,
    subtitles,
    textOverlays,
    timelineSegments,
    timelineZoom,
    trimRange,
    videoCornerStyle,
    zoomEffects
  });

  useEffect(() => {
    const customBackground = customBackgroundImportId
      ? importedMedia.find((item) => item.id === customBackgroundImportId)
      : null;
    setCustomBackgroundUrl(customBackground?.url ?? null);
  }, [customBackgroundImportId, importedMedia]);

  // Clip edits can invalidate a cut reference. Remove only stale transition
  // metadata; never move or trim the user's clips as background housekeeping.
  useEffect(() => {
    setTransitions((current) => {
      const next = sanitizeClipTransitions(timelineSegments, current);
      return next.length === current.length ? current : next;
    });
  }, [timelineSegments]);

  useEffect(() => {
    setSelectedTransitionId((current) =>
      current && transitions.some((transition) => transition.id === current) ? current : null
    );
  }, [transitions]);

  // Most editor paths still identify one primary clip. Keep the new range
  // selection in sync when an older single-selection path (paste, import,
  // undo, etc.) changes that primary id.
  useEffect(() => {
    if (!selectedTimelineSegmentId) {
      setSelectedTimelineSegmentIds([]);
      return;
    }
    setSelectedTimelineSegmentIds((current) => {
      if (current.includes(selectedTimelineSegmentId)) {
        return current;
      }
      setTimelineRangeSelection(null);
      return [selectedTimelineSegmentId];
    });
  }, [selectedTimelineSegmentId]);

  useEffect(() => {
    const availableIds = new Set(timelineSegments.map((segment) => segment.id));
    setSelectedTimelineSegmentIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [timelineSegments]);

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
    projectScreen,
    screenAspectEnabled,
    screenEditEnabled,
    screenStyle,
    selectedItem,
    selectedSubtitle,
    selectedTextOverlay,
    selectedSpeedEffect,
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
    screenMediaAspect,
    screenPosition,
    selectedItemId,
    selectedSubtitleId,
    selectedTextOverlayId,
    selectedTimelineSegmentId,
    selectedZoomId,
    selectedSpeedId,
    speedEffects,
    subtitles,
    textOverlays,
    timelineSegments,
    timelineViewDuration,
    videoCornerStyle,
    zoomEffects,
    zoomPreviewTime
  });

  /** Creates a text overlay where the panel's text tile was dropped on the
   * timeline. Animation is opt-in: new text starts with none. */
  function addTextOverlayAt(dropTime: number) {
    const start = clampNumber(dropTime, 0, Math.max(0, timelineDuration - 0.2));
    const nextOverlay: TextOverlay = {
      id: createId("text"),
      start,
      end: Math.max(start + 0.2, Math.min(timelineDuration, start + 3)),
      text: "Your text",
      x: 50,
      y: 50,
      size: 64,
      color: "#ffffff",
      fontFamily: "sans",
      opacity: 100,
      weight: 700,
      animation: "none"
    };
    setTextOverlays((current) => [...current, nextOverlay]);
    setSelectedTextOverlayId(nextOverlay.id);
    setActiveTool("text");
  }

  function updateTextOverlay(id: string, updates: Partial<TextOverlay>) {
    setTextOverlays((current) => current.map((overlay) => {
      if (overlay.id !== id) return overlay;
      const next = { ...overlay, ...updates };
      const start = clampNumber(next.start, 0, Math.max(0, timelineRenderDuration - 0.2));
      return {
        ...next,
        start,
        end: clampNumber(next.end, start + 0.2, Math.max(start + 0.2, timelineRenderDuration)),
        x: clampNumber(next.x, 0, 100),
        y: clampNumber(next.y, 0, 100),
        size: clampNumber(next.size, 12, 240),
        color: /^#[0-9a-f]{6}$/i.test(next.color) ? next.color : overlay.color
      };
    }));
  }

  function removeTextOverlay(id: string) {
    setTextOverlays((current) => current.filter((overlay) => overlay.id !== id));
    setSelectedTextOverlayId((current) => current === id ? null : current);
  }

  const {
    audioElsRef,
    beginPlaybackInteraction,
    cameraRef,
    currentTimeRef,
    endPlaybackInteraction,
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
    beginTimelineRulerDurationResize,
    beginTimelinePanelResize,
    bodyRef: timelineBodyRef,
    cancelTimelineRulerDurationResize,
    contractTimelineRulerDuration,
    endTimelinePanelResize,
    endTimelineRulerDurationResize,
    expandTimelineRulerDuration,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    moveTimelineRulerDurationResize,
    resetTimelinePanelHeight,
    resetTimelineRulerDuration,
    resetTimelineZoom,
    seekTimelinePointer,
    timelinePanelHeight,
    zoomTimelineWithWheel,
    zoomTimelineIn,
    zoomTimelineOut
  } = useTimelineViewport({
    contentDuration: timelineDuration,
    renderDuration: timelineRenderDuration,
    seek,
    setTimelineViewDuration,
    timelineZoom,
    setTimelineZoom
  });

  const {
    beginPanelResize,
    endPanelResize,
    movePanelResize,
    nudgePanelWidth,
    resetPanelWidth,
    workspaceRef,
    workspaceStyle
  } = useWorkspacePanelResize();

  const {
    importCustomBackground,
    importMedia,
    importMediaFromPaths,
    ingestImportedFiles,
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
  });

  const musicGeneration = useMusicGeneration({
    onGenerated: (result) =>
      void ingestImportedFiles([result], { backgroundAudio: true, selectFirst: false }),
    setError
  });

  const handledMediaImportIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isEditorStateReady || !pendingMediaImport) return;
    if (handledMediaImportIdsRef.current.has(pendingMediaImport.requestId)) return;
    handledMediaImportIdsRef.current.add(pendingMediaImport.requestId);
    const request = pendingMediaImport;
    setPendingMediaImport(null);
    void importMediaFromPaths(request.paths, {
      addToTimeline: request.placement === "timeline",
      backgroundAudio: request.placement === "background-audio",
      customBackground: request.placement === "custom-background",
      selectFirst: request.placement === "media-bin",
      timelineStart: request.timelineStart
    }).catch((importError) => {
      setError(`AI media import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
    });
  }, [isEditorStateReady, pendingMediaImport, importMediaFromPaths, setError]);

  const handledMusicGenerationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isEditorStateReady || !pendingMusicGeneration) return;
    if (handledMusicGenerationIdsRef.current.has(pendingMusicGeneration.requestId)) return;
    handledMusicGenerationIdsRef.current.add(pendingMusicGeneration.requestId);
    const request = pendingMusicGeneration;
    setPendingMusicGeneration(null);
    void musicGeneration.generate({
      engine: request.engine,
      prompt: request.prompt,
      lyrics: request.lyrics,
      durationSeconds: 30,
      inferSteps: 60,
      guidanceScale: 15,
      seed: null
    });
  }, [isEditorStateReady, pendingMusicGeneration, musicGeneration]);

  const geminiChat = useGeminiChat({ projectId: project?.id ?? null });

  const {
    canExport,
    cancelExport,
    closeExportDialog,
    exportCurrentVideo,
    exportDialogOpen,
    exportFormat,
    exportProgress,
    exporting,
    exportResolution,
    exportSubtitleMode,
    hasSubtitles,
    openExportDialog,
    setExportFormat,
    setExportResolution,
    setExportSubtitleMode
  } = useEditorExport({
    audioLevels,
    backgroundAudioIds,
    masterVolume,
    project,
    projectScreen,
    selectedItem,
    setError,
    setExportMessage,
    subtitles,
    trimRange,
    beforeExport: saveState
  });

  const {
    beginCameraLayoutDrag,
    beginScreenLayoutDrag,
    resetCameraContentTransform,
    selectCameraPosition,
    selectCameraSize,
    snapOverlay,
    updateCameraContentTransform
  } = usePreviewLayoutControls({
    cameraEditEnabled,
    cameraFrame,
    screenEditEnabled,
    screenPosition,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraSize,
    setScreenPosition
  });

  // Everything the timeline does — editing (commit/undo/split/delete), effect
  // regions, subtitle transcription, pointer drags, clipboard, and keyboard
  // shortcuts — is assembled by one controller facade.
  const {
    addSpeedEffect,
    addSubtitle,
    addZoomEffect,
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTextOverlayClipDrag,
    beginTimelineClipMove,
    beginTimelineClipTrim,
    beginTimelineScrub,
    beginZoomClipDrag,
    deleteSelectedTimelineSegment,
    deleteTimelineSegment,
    endTimelineScrub,
    cancelTranscription,
    generateSubtitles,
    providerKeys,
    refreshProviderKeys,
    sttProvider,
    sttActivityRanges,
    updateProviderSettings,
    handleTimelineDragOver,
    handleTimelineDrop,
    moveTimelineScrub,
    openTimelineContextMenu,
    redoTimelineEdit,
    removeSpeedEffect,
    removeZoomEffect,
    splitTimelineSegment,
    sttDownloadProgress,
    sttStatus,
    undoTimelineEdit,
    updateSpeedEffect,
    updateSubtitle,
    updateZoomEffect
  } = useTimelineController({
    activeDuration,
    activeTool,
    allMedia,
    audioElsRef,
    audioLevels,
    audioSources,
    audioTimelineClips,
    backgroundAudioIds,
    videoTimelineClips,
    beginPlaybackInteraction,
    currentTime,
    currentTimeRef,
    endPlaybackInteraction,
    getTimelineTimeFromClientX,
    isEditorStateReady,
    knownTimelineItemIdsRef,
    mediaById,
    mediaDurationById,
    onDropNewTextOverlay: addTextOverlayAt,
    openExportDialog,
    playingRef,
    scheduleTimelinePlaybackSync,
    seek,
    seekTimelinePointer,
    selectedItemId,
    selectedSpeedId,
    selectedSubtitleId,
    selectedTextOverlayId,
    selectedTimelineItemId,
    selectedTimelineSegmentId,
    selectedTimelineSegmentIds,
    selectedZoomId,
    setActiveTool,
    setError,
    setExportMessage,
    setScrubbingTimeline,
    setSelectedItemId,
    setSelectedSpeedId,
    setSelectedSubtitleId,
    setSelectedTextOverlayId,
    setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds,
    setSelectedZoomId,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitles,
    setTextOverlays,
    setTimelineContextMenu,
    setTimelineRangeSelection,
    setTimelineSegments,
    setTimelineViewDuration,
    setTrimRange,
    setZoomEffects,
    speedEffects,
    subtitles,
    syncMediaToTime,
    textOverlays,
    timelineBodyRef,
    timelineDuration,
    timelineRangeSelection,
    timelineEditableItems,
    timelineRenderDuration,
    timelineSegments,
    togglePlayback: () => void togglePlayback(),
    updateMediaDuration,
    updateTextOverlay,
    zoomEffects
  });

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  const leaveToHome = async () => {
    // Flush any pending edits for an existing project (a brand-new edit has no
    // folder yet, so it can't be saved without prompting — just leave). Then
    // disable the beforeunload guard so the navigation actually happens.
    try {
      if (project && hasUnsavedChanges()) {
        await saveState(true);
      }
    } catch {
      // Even if the final save fails, still let the user leave the editor.
    }
    allowUnload();
    await window.openVideoCraft.windows.openMain();
  };

  const displayProjectName = project?.name ?? pendingProjectName;
  const renameProject = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!project) {
      setPendingProjectName(trimmed);
      return;
    }
    if (trimmed === project.name) {
      return;
    }
    try {
      const updated = await window.openVideoCraft.projects.rename({
        projectId: project.id,
        name: trimmed
      });
      setProject(updated);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename the project.");
    }
  };

  const setClipTransition = (input: Omit<ClipTransition, "id">) => {
    const transitionId = `${input.fromSegmentId}:${input.toSegmentId}:transition`;
    setTransitions((current) => {
      const next = [
        ...current.filter((item) =>
          item.fromSegmentId !== input.fromSegmentId ||
          item.toSegmentId !== input.toSegmentId
        ),
        { ...input, id: transitionId }
      ];
      try {
        validateClipTransitions(timelineSegments, next);
        setSelectedTransitionId(transitionId);
        setError(null);
        return next;
      } catch (transitionError) {
        setError(
          transitionError instanceof Error
            ? transitionError.message
            : String(transitionError)
        );
        return current;
      }
    });
  };

  const removeClipTransition = (fromSegmentId: string, toSegmentId: string) => {
    setTransitions((current) => current.filter((item) =>
      item.fromSegmentId !== fromSegmentId || item.toSegmentId !== toSegmentId
    ));
    setSelectedTransitionId(null);
  };

  return (
    <main className="editor-app grid h-dvh min-h-0 overflow-hidden bg-[#0b0b0d] p-0 text-[#f5f5f6]">
      <section
        className="editor-shell grid h-dvh w-full min-h-0 min-w-0 overflow-hidden bg-[#0b0b0d]"
        style={{
          gridTemplateRows: timelineVisible
            ? `auto minmax(0, 1fr) ${timelinePanelHeight}px`
            : "auto minmax(0, 1fr)"
        }}
      >
        <EditorTopbar
          projectName={displayProjectName}
          exporting={exporting}
          canExport={canExport}
          onBackHome={() => void leaveToHome()}
          onRename={renameProject}
          onOpenExport={openExportDialog}
          onOpenAi={() => setAiDialogOpen(true)}
          onSave={() => void saveState(true)}
        />

        <AiConnectionDialog
          open={aiDialogOpen}
          lastAgentEdit={lastAgentEdit}
          onClose={() => setAiDialogOpen(false)}
          onUndo={undoLastAgentEdit}
          onProviderKeysChanged={() => void refreshProviderKeys()}
        />

        {exportDialogOpen ? (
          <ExportDialog
            exportFormat={exportFormat}
            exportProgress={exportProgress}
            exportResolution={exportResolution}
            exportSubtitleMode={exportSubtitleMode}
            exporting={exporting}
            hasSubtitles={hasSubtitles}
            onClose={closeExportDialog}
            onCancelExport={() => void cancelExport()}
            onExport={() => void exportCurrentVideo()}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
            onSubtitleModeChange={setExportSubtitleMode}
          />
        ) : null}
        <EditorNotifications error={error} exportMessage={exportMessage} onDismissError={() => setError(null)} onDismissMessage={() => setExportMessage(null)} />
        {!error && !exportMessage ? <UpdateNotification status={updateStatus} onInstall={() => void installUpdate()} /> : null}

        <div
          className="editor-workspace grid min-h-0 min-w-0 overflow-hidden"
          ref={workspaceRef}
          style={workspaceStyle}
        >
          <div className="editor-library relative flex min-h-0 min-w-0 overflow-hidden bg-[#0b0b0d]">
            <ToolRail activeTool={activeTool} onToolChange={setActiveTool} />

            <aside className="editor-library-panel my-1.5 mr-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-black p-2.5">
              <div
                className="editor-tool-panel-switch flex min-h-0 flex-1 flex-col"
                data-editor-tool-panel={activeTool}
                key={activeTool}
              >
                {activeTool === "media" ? (
                  <MediaPanel
                    activeTab={activePanel}
                    visibleMedia={visibleMedia}
                    selectedItemId={selectedItem?.id ?? null}
                    onImport={() => void importMedia()}
                    onImportPaths={(filePaths) => void importMediaFromPaths(filePaths)}
                    onTabChange={setActivePanel}
                    onSelectItem={selectTimelineItem}
                    onItemDuration={updateMediaDuration}
                    onRemoveItem={removeImportedMedia}
                  />
                ) : (
                  <EditorToolPanel
            activeTool={activeTool}
            layoutMode={layoutMode}
            screenScale={screenPosition.scale}
            screenAspectRatio={screenAspectRatio}
            screenAspectEnabled={screenAspectEnabled}
            cameraShape={cameraShape}
            cameraBorderStyle={cameraBorderStyle}
            cameraPosition={cameraPosition}
            cameraSize={cameraSize}
            cameraContentTransform={cameraContentTransform}
            masterVolume={masterVolume}
            audioSources={audioSources}
            audioLevels={audioLevels}
            previewItem={previewItem}
            selectedZoomEffect={selectedZoomEffect}
            selectedSpeedEffect={selectedSpeedEffect}
            transitions={transitions}
            selectedTransitionId={selectedTransitionId}
            videoClips={videoTimelineClips}
            sttDownloadProgress={sttDownloadProgress}
            sttStatus={sttStatus}
            sttModelLabel={whisperTranscriptionModelLabel}
            sttProvider={sttProvider}
            providerKeys={providerKeys}
            onCancelTranscription={cancelTranscription}
            onSttProviderChange={(provider) =>
              void updateProviderSettings({ sttProvider: provider })
            }
            onCohereLanguageChange={(language) =>
              void updateProviderSettings({ cohereLanguage: language })
            }
            onOpenAiSettings={() => setAiDialogOpen(true)}
            musicGenerationState={musicGeneration.generationState}
            musicProgress={musicGeneration.progress}
            musicLastLyrics={musicGeneration.lastLyrics}
            onMusicGenerate={(form) => void musicGeneration.generate(form)}
            onMusicCancel={musicGeneration.cancel}
            assistantProjectId={project?.id ?? null}
            assistantMessages={geminiChat.messages}
            assistantSending={geminiChat.sending}
            assistantStatusMessage={geminiChat.statusMessage}
            assistantError={geminiChat.chatError}
            onAssistantSend={(message) => void geminiChat.send(message)}
            onAssistantCancel={geminiChat.cancel}
            onAssistantReset={() => void geminiChat.reset()}
            onAssistantUndoEdit={() => void undoLastAgentEdit()}
            subtitleLanguage={formatSubtitleLanguage(subtitleLanguage)}
            subtitleStyle={subtitleStyle}
            subtitles={subtitles}
            selectedSubtitleId={selectedSubtitleId}
            selectedSubtitle={selectedSubtitle}
            subtitleDuration={timelineDuration}
            currentTime={currentTime}
            textOverlays={textOverlays}
            selectedTextOverlayId={selectedTextOverlayId}
            selectedTextOverlay={selectedTextOverlay}
            activeBackgroundCategory={activeBackgroundCategory}
            backgroundStyle={backgroundStyle}
            videoCornerStyle={videoCornerStyle}
            onSelectItem={selectTimelineItem}
            onLayoutModeChange={(mode) => {
              setLayoutMode(mode);
              // A preset describes a complete look; leftover manual drags or
              // scaling would keep "fill" from filling and "fit" from fitting.
              setScreenPosition({ x: 0, y: 0, scale: 100 });
            }}
            onScreenScaleChange={(scale) =>
              setScreenPosition((current) => ({ ...current, scale }))
            }
            onScreenAspectRatioChange={setScreenAspectRatio}
            onCameraShapeChange={setCameraShape}
            onCameraBorderStyleChange={setCameraBorderStyle}
            onCameraPositionChange={selectCameraPosition}
            onCameraSizeChange={selectCameraSize}
            onCameraContentTransformChange={updateCameraContentTransform}
            onCameraContentTransformReset={resetCameraContentTransform}
            onMasterVolumeChange={setMasterVolume}
            onAddBackgroundMusic={() =>
              void importMedia({ backgroundAudio: true, selectFirst: false })
            }
            onSetAudioLevel={setAudioLevel}
            onAddZoom={addZoomEffect}
            onUpdateZoom={updateZoomEffect}
            onRemoveZoom={removeZoomEffect}
            onPreviewZoomCurve={(effect, progress) =>
              setZoomPreviewTime(
                progress === null ? null : getZoomPreviewTime(effect, progress)
              )
            }
            onAddSpeed={addSpeedEffect}
            onUpdateSpeed={updateSpeedEffect}
            onRemoveSpeed={removeSpeedEffect}
            onSetTransition={setClipTransition}
            onRemoveTransition={removeClipTransition}
            onAddSubtitle={addSubtitle}
            onGenerateSubtitles={() => {
              // Keep the first click anchored to Subtitles while async audio
              // preparation and the Whisper worker begin.
              setActiveTool("subtitles");
              void generateSubtitles();
            }}
            onSubtitleStyleChange={setSubtitleStyle}
            onUpdateSubtitle={updateSubtitle}
            onSelectSubtitle={setSelectedSubtitleId}
            onAddTextOverlay={() => addTextOverlayAt(currentTime)}
            onSelectTextOverlay={setSelectedTextOverlayId}
            onUpdateTextOverlay={updateTextOverlay}
            onRemoveTextOverlay={removeTextOverlay}
            onBackgroundCategoryChange={setActiveBackgroundCategory}
            onBackgroundStyleChange={setBackgroundStyle}
            onUploadCustomBackground={() => void importCustomBackground()}
            onCornerStyleChange={setVideoCornerStyle}
          />
                )}
              </div>
            </aside>

            <WorkspaceResizeHandle
              edge="right"
              label="Resize tool panel"
              onPointerDown={(event) => beginPanelResize(event, "library")}
              onPointerMove={movePanelResize}
              onPointerUp={endPanelResize}
              onDoubleClick={() => resetPanelWidth("library")}
              onNudge={(deltaX) => nudgePanelWidth("library", deltaX)}
            />
          </div>

          <EditorPreviewPanel
            previewClassName={previewClassName}
            previewFrameStyle={previewFrameStyle}
            previewQuality={previewQuality}
            previewZoom={previewZoom}
            previewItem={previewItem}
            videoTimelineClips={videoTimelineClips}
            transitions={transitions}
            audioTimelineClips={audioTimelineClips}
            isProjectCompositionSelected={isProjectCompositionSelected}
            projectCamera={projectCamera}
            layoutMode={layoutMode}
            screenStyle={screenStyle}
            cameraStyle={cameraStyle}
            cameraVideoStyle={cameraVideoStyle}
            screenEditEnabled={screenEditEnabled}
            cameraEditEnabled={cameraEditEnabled}
            snapOverlay={snapOverlay}
            activeSubtitle={activeSubtitle}
            subtitleStyle={subtitleStyle}
            textOverlays={textOverlays}
            selectedTextOverlayId={selectedTextOverlayId}
            currentTime={currentTime}
            playing={playing}
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            renderDuration={timelineRenderDuration}
            masterVolume={masterVolume}
            onMasterVolumeChange={setMasterVolume}
            onTogglePlayback={() => void togglePlayback()}
            onSeekFrame={seekFrame}
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
            onScreenDimensions={(width, height) =>
              setScreenMediaAspect(width > 0 && height > 0 ? width / height : null)
            }
            onPreviewQualityChange={setPreviewQuality}
            onPreviewZoomChange={(zoom) => setPreviewZoom(clampNumber(zoom, 0.65, 1.6))}
            onSubtitleClick={(subtitleId) => {
              setSelectedSubtitleId(subtitleId);
              setActiveTool("subtitles");
            }}
            onTextOverlayClick={(textOverlayId) => {
              setSelectedTextOverlayId(textOverlayId);
              setActiveTool("text");
            }}
            onTextOverlayMove={(textOverlayId, x, y) => {
              updateTextOverlay(textOverlayId, { x, y });
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
          timelineZoom={timelineZoom}
          onZoomIn={zoomTimelineIn}
          onZoomOut={zoomTimelineOut}
          onZoomReset={resetTimelineZoom}
          onZoomWheel={zoomTimelineWithWheel}
          onRulerPointerDown={beginTimelineRulerDurationResize}
          onRulerPointerMove={moveTimelineRulerDurationResize}
          onRulerPointerUp={endTimelineRulerDurationResize}
          onRulerPointerCancel={cancelTimelineRulerDurationResize}
          onRulerContract={contractTimelineRulerDuration}
          onRulerExpand={expandTimelineRulerDuration}
          onRulerReset={resetTimelineRulerDuration}
          activeTool={activeTool}
          playing={playing}
          scrubbing={scrubbingTimeline}
          currentTime={currentTime}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          playheadPercent={playheadPercent}
          contentDuration={timelineDuration}
          renderDuration={timelineRenderDuration}
          videoClips={videoTimelineClips}
          audioTracks={audioTimelineTracks}
          audioLevels={audioLevels}
          onSetAudioLevel={setAudioLevel}
          zoomEffects={zoomEffects}
          speedEffects={speedEffects}
          transitions={transitions}
          subtitles={subtitles}
          subtitleProcessing={sttStatus === "loading" || sttStatus === "transcribing"}
          subtitleProcessingRanges={sttActivityRanges}
          textOverlays={textOverlays}
          selectedSegmentId={selectedTimelineSegmentId}
          selectedSegmentIds={selectedTimelineSegmentIds}
          rangeSelection={timelineRangeSelection}
          selectedZoomId={selectedZoomId}
          selectedSpeedId={selectedSpeedId}
          selectedSubtitleId={selectedSubtitleId}
          selectedTextOverlayId={selectedTextOverlayId}
          contextMenu={timelineContextMenu}
          canSplitAtContextMenu={
            timelineContextMenu
              ? canSplitTimelineSegmentAt(timelineSegments, timelineContextMenu)
              : false
          }
          canSplitAtPlayhead={Boolean(
            findSplittableTimelineSegment(timelineSegments, selectedTimelineSegmentId, currentTime)
          )}
          onTogglePlayback={() => void togglePlayback()}
          onSeekFrame={seekFrame}
          onUndo={undoTimelineEdit}
          onRedo={redoTimelineEdit}
          onSplitAtPlayhead={() =>
            splitTimelineSegment(selectedTimelineSegmentId, currentTime)
          }
          onDeleteSelected={deleteSelectedTimelineSegment}
          onSelectClip={(clip, additive) => {
            setSelectedZoomId(null);
            setSelectedSpeedId(null);
            setSelectedSubtitleId(null);
            setSelectedTextOverlayId(null);
            setSelectedTransitionId(null);
            setSelectedItemId(clip.item.id);
            setSelectedTimelineSegmentIds((current) => {
              if (additive) {
                const next = current.includes(clip.id)
                  ? current.filter((id) => id !== clip.id)
                  : [...current, clip.id];
                setSelectedTimelineSegmentId(next[0] ?? null);
                setTimelineRangeSelection(null);
                return next;
              }
              if (current.length > 1 && current.includes(clip.id)) {
                setSelectedTimelineSegmentId(clip.id);
                return current;
              }
              setSelectedTimelineSegmentId(clip.id);
              setTimelineRangeSelection(null);
              return [clip.id];
            });
          }}
          onSelectZoom={(effect) => {
            setSelectedTimelineSegmentId(null);
            setSelectedTimelineSegmentIds([]);
            setTimelineRangeSelection(null);
            setSelectedZoomId(effect.id);
            setSelectedSpeedId(null);
            setSelectedSubtitleId(null);
            setSelectedTextOverlayId(null);
            setSelectedTransitionId(null);
            setActiveTool("zoom");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectSpeed={(effect) => {
            setSelectedTimelineSegmentId(null);
            setSelectedTimelineSegmentIds([]);
            setTimelineRangeSelection(null);
            setSelectedZoomId(null);
            setSelectedSpeedId(effect.id);
            setSelectedSubtitleId(null);
            setSelectedTextOverlayId(null);
            setSelectedTransitionId(null);
            setActiveTool("speed");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectTransition={(transition) => {
            setSelectedTransitionId(transition.id);
            setActiveTool("transitions");
            const from = videoTimelineClips.find(
              (clip) => clip.id === transition.fromSegmentId
            );
            if (from) seek(from.start + from.duration);
          }}
          onDropTransition={(transition) => {
            setClipTransition(transition);
            setActiveTool("transitions");
          }}
          onSelectSubtitle={(subtitleId) => {
            setSelectedTimelineSegmentId(null);
            setSelectedTimelineSegmentIds([]);
            setTimelineRangeSelection(null);
            setSelectedZoomId(null);
            setSelectedSpeedId(null);
            setSelectedSubtitleId(subtitleId);
            setSelectedTextOverlayId(null);
            setSelectedTransitionId(null);
            setActiveTool("subtitles");
            const subtitle = subtitles.find((item) => item.id === subtitleId);
            if (subtitle) {
              seek((subtitle.start + subtitle.end) / 2);
            }
          }}
          onSelectTextOverlay={(overlay) => {
            setSelectedTimelineSegmentId(null);
            setSelectedTimelineSegmentIds([]);
            setTimelineRangeSelection(null);
            setSelectedZoomId(null);
            setSelectedSpeedId(null);
            setSelectedSubtitleId(null);
            setSelectedTextOverlayId(overlay.id);
            setSelectedTransitionId(null);
            setActiveTool("text");
            seek((overlay.start + overlay.end) / 2);
          }}
          onTrimPointerDown={beginTimelineClipTrim}
          onMovePointerDown={beginTimelineClipMove}
          onZoomDragPointerDown={beginZoomClipDrag}
          onSpeedDragPointerDown={beginSpeedClipDrag}
          onSubtitleDragPointerDown={beginSubtitleClipDrag}
          onTextOverlayDragPointerDown={beginTextOverlayClipDrag}
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
