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
import { useEffect, useMemo, useRef, useState } from "react";
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
import { applyCleanupPreviewUrls } from "./editor/cleanup-preview";
import { useEditorDerivedData } from "./editor/useEditorDerivedData";
import {
  consumeAutoAnalyzeRequest,
  shouldStartAutoTranscription
} from "./editor/auto-transcription";
import { generateAutoZoomEffects } from "../shared/editor-domain/auto-zoom";
import { emptyScreenCrop } from "../shared/editor-domain/screen-crop";
import { timelineCutTimes } from "./editor/timeline-utils";
import { useCameraBackground } from "./editor/useCameraBackground";
import type { ScreenCrop } from "../shared/editor-domain/types";
import { useEditorExport } from "./editor/useEditorExport";
import { useEditorMediaActions } from "./editor/useEditorMediaActions";
import { useClaudeChat } from "./editor/useClaudeChat";
import { useProjectClipRecorder } from "./editor/useProjectClipRecorder";
import { useGeminiChat } from "./editor/useGeminiChat";
import type { AssistantProvider } from "./editor/panels/AssistantPanel";
import { useMusicGeneration } from "./editor/useMusicGeneration";
import { useEditorPlayback } from "./editor/useEditorPlayback";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { usePreviewQuality } from "./editor/usePreviewQuality";
import { usePreviewLayoutControls } from "./editor/usePreviewLayoutControls";
import { useTimelineController } from "./editor/useTimelineController";
import {
  areTimelineSegmentsHidden,
  resolveVisibilityToggleClipIds
} from "./editor/useTimelineEditing";
import {
  getTimelineZoomAfterShortcut,
  useTimelineViewport
} from "./editor/useTimelineViewport";
import { useWorkspacePanelResize } from "./editor/useWorkspacePanelResize";
import { useAppUpdateStatus } from "./useAppUpdateStatus";
import {
  formatSubtitleLanguage,
  whisperTranscriptionModelLabel
} from "./editor/subtitle-transcription";
import {
  canSplitTimelineSegmentAt,
  canSplitTimelineSelectionAt,
  getContextMenuSplitSelectionIds
} from "./editor/timeline-utils";
import { getLinkedRecordingAudioIdsForSelection } from "./editor/timeline-links";
import { getTimelineClipGroupIds } from "./editor/timeline-groups";
import { resolveTimelineClipPress } from "./editor/timeline-selection";
import { clampNumber, createId } from "./editor/utils";
import { getZoomPreviewTime } from "./editor/zoom-utils";
import {
  sanitizeClipEdgeTransitions,
  sanitizeClipTransitions,
  validateClipEdgeTransitions,
  validateClipTransitions
} from "../shared/editor-domain";
import type {
  AudioCleanupState,
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
  ClipEdgeTransition,
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
  // A finished recording asks for one automatic transcription. Consume the
  // flag now so a reload never runs it again over existing subtitles.
  const [autoTranscriptionRequested] = useState(() => {
    const consumed = consumeAutoAnalyzeRequest(window.location.search);
    if (consumed.requested) {
      window.history.replaceState(null, "", `${window.location.pathname}${consumed.search}`);
    }
    return consumed.requested;
  });
  const autoTranscriptionStartedRef = useRef(false);
  const autoZoomStartedRef = useRef(false);
  const cameraBackground = useCameraBackground(projectId);
  const [project, setProject] = useState<ProjectView | null>(null);
  // Name the user typed for a not-yet-created edit; applied when the project is
  // first saved to disk. Once a project exists, renames persist immediately.
  const [pendingProjectName, setPendingProjectName] = useState("");
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [cleanupPreviews, setCleanupPreviews] = useState<
    Record<string, { key: string; url: string }>
  >({});
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
  const [screenCrop, setScreenCrop] = useState<ScreenCrop>(emptyScreenCrop);
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
  const [audioCleanup, setAudioCleanup] = useState<AudioCleanupState>({});
  const [backgroundAudioIds, setBackgroundAudioIds] = useState<string[]>([]);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [zoomPreviewTime, setZoomPreviewTime] = useState<number | null>(null);
  const [speedEffects, setSpeedEffects] = useState<SpeedEffect[]>([]);
  const [transitions, setTransitions] = useState<ClipTransition[]>([]);
  const [edgeTransitions, setEdgeTransitions] = useState<ClipEdgeTransition[]>([]);
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
  const [timelineDragActive, setTimelineDragActive] = useState(false);
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

  useEffect(() => {
    function onZoomShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      const shortcut = event.key === "=" || event.key === "+" ? "in"
        : event.key === "-" ? "out"
          : event.key === "0" ? "fit" : null;
      if (shortcut === null) return;
      event.preventDefault();
      setTimelineZoom((zoom) => getTimelineZoomAfterShortcut(zoom, shortcut));
    }
    window.addEventListener("keydown", onZoomShortcut);
    return () => window.removeEventListener("keydown", onZoomShortcut);
  }, []);

  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());

  const {
    allowUnload,
    flushState,
    hasUnsavedChanges,
    isReady: isEditorStateReady,
    lastAgentEdit,
    saveState,
    undoLastAgentEdit
  } = useEditorPersistence({
    activeBackgroundCategory,
    audioCleanup,
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
    screenCrop,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioCleanup,
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
    setScreenCrop,
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
    setEdgeTransitions,
    edgeTransitions,
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
    if (!projectId) return;
    let active = true;
    for (const [itemId, settings] of Object.entries(audioCleanup)) {
      if (!settings || settings.strength === 0) continue;
      const mediaItem = importedMedia.find((item) => item.id === itemId);
      if (!mediaItem) continue;
      const key = `${settings.preset}:${settings.strength}`;
      if (cleanupPreviews[itemId]?.key === key) continue;
      const jobId = crypto.randomUUID();
      void window.openVideoCraft.audio.prepareCleanup({
        jobId, projectId, itemId, preset: settings.preset, strength: settings.strength
      }).then((result) => {
        if (active) setCleanupPreviews((current) => ({
          ...current,
          [itemId]: { key, url: result.url }
        }));
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [projectId, audioCleanup, cleanupPreviews, importedMedia]);

  const previewImportedMedia = useMemo(
    () => applyCleanupPreviewUrls(importedMedia, cleanupPreviews),
    [importedMedia, cleanupPreviews]
  );
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
    setEdgeTransitions((current) => {
      const next = sanitizeClipEdgeTransitions(timelineSegments, current);
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
    allMedia,
    audioSources,
    audioTimelineClips,
    audioTimelineTracks,
    cameraEditEnabled,
    cameraStyle,
    cameraVideoStyle,
    currentFrame,
    mediaById,
    mediaDurationById,
    playheadPercent,
    previewBaseClip,
    previewCameraClip,
    previewCameraItem,
    previewClassName,
    previewFrameStyle,
    previewItem,
    showNoCameraRecording,
    projectMedia,
    projectScreen,
    screenAspectEnabled,
    screenEditEnabled,
    screenStyle,
    screenContentStyle,
    cameraMaskUrl,
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
    importedMedia: previewImportedMedia,
    layoutMode,
    project,
    screenAspectRatio,
    screenCrop,
    cameraMaskUrl: cameraBackground.matteUrl,
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

  const cleanupAudioUrls = useMemo(
    () => Object.fromEntries(Object.entries(cleanupPreviews).map(([id, preview]) => [id, preview.url])),
    [cleanupPreviews]
  );
  const cleanupVideoClips = useMemo(
    () => videoTimelineClips.flatMap((clip) => {
      const url = cleanupAudioUrls[clip.item.id];
      return url ? [{ id: clip.id, url }] : [];
    }),
    [videoTimelineClips, cleanupAudioUrls]
  );

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

  const projectRecorder = useProjectClipRecorder({
    projectId,
    onImported: (files) => {
      ingestImportedFiles(files, { addToTimeline: true, timelineStart: currentTimeRef.current });
    }
  });

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
    activeBaseClip: previewBaseClip,
    activeCameraClip: previewCameraClip,
    activeDuration,
    audioLevels,
    audioCleanup,
    audioTimelineClips,
    cleanupAudioUrls,
    currentTime,
    layoutMode,
    masterVolume,
    mediaById,
    playing,
    selectedTimelineSegmentId,
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
    beginTimelineRulerPointer,
    beginTimelinePanelResize,
    bodyRef: timelineBodyRef,
    cancelTimelineRulerPointer,
    contractTimelineRulerDuration,
    endTimelinePanelResize,
    endTimelineRulerPointer,
    expandTimelineRulerDuration,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    moveTimelineRulerPointer,
    resetTimelinePanelHeight,
    resetTimelineRulerDuration,
    resetTimelineZoom,
    seekTimelinePointer,
    timelinePanelHeight,
    zoomTimelineWithWheel,
    zoomTimelineIn,
    zoomTimelineOut
  } = useTimelineViewport({
    cutTimes: timelineCutTimes(timelineSegments),
    beginPlaybackInteraction,
    contentDuration: timelineDuration,
    endPlaybackInteraction,
    renderDuration: timelineRenderDuration,
    seek,
    setScrubbingTimeline,
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
      lyrics: request.lyrics
    });
  }, [isEditorStateReady, pendingMusicGeneration, musicGeneration]);

  const geminiChat = useGeminiChat({ projectId: project?.id ?? null });
  const claudeChat = useClaudeChat({ projectId: project?.id ?? null });
  const [assistantProvider, setAssistantProvider] = useState<AssistantProvider>("claude-max");
  const activeChat = assistantProvider === "claude-max" ? claudeChat : geminiChat;

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
    textOverlays,
    timelineSegments,
    trimRange,
    hasVideoTimeline: timelineSegments.some((segment) => segment.track === "video"),
    beforeExport: flushState
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
    setSelectedClipsLayout,
    setSelectedClipsCameraStyle,
    closeTimelineGaps,
    toggleSelectedTimelineHidden,
    toggleVideoLaneVisibility,
    swapVideoChannels,
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
    splitSelectionAtPlayhead,
    splitSelectedTimelineSegments,
    sttDownloadProgress,
    sttStatus,
    undoTimelineEdit,
    updateSpeedEffect,
    updateSubtitle,
    updateZoomEffect
  } = useTimelineController({
    activeDuration,
    layoutMode,
    activeTool,
    applyTimelineClipSelection,
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
    setTimelineDragActive,
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
    timelineDragActive,
    timelineDuration,
    timelineRangeSelection,
    timelineEditableItems,
    timelineRenderDuration,
    timelineSegments,
    timelineViewDuration,
    togglePlayback: () => void togglePlayback(),
    updateMediaDuration,
    updateTextOverlay,
    zoomEffects
  });

  // Analyze a fresh recording once: transcribe speech into timestamped
  // subtitles as soon as the persisted editor state is ready.
  useEffect(() => {
    // Without a connection the local model cannot be fetched yet; the owner
    // starts the transcription from the Subtitles tool when it is available.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const shouldStart = shouldStartAutoTranscription({
      requested: autoTranscriptionRequested,
      editorReady: isEditorStateReady,
      speechSourceCount: videoTimelineClips.length + audioTimelineClips.length,
      subtitleCount: subtitles.length,
      alreadyStarted: autoTranscriptionStartedRef.current
    });
    if (!shouldStart) return;
    autoTranscriptionStartedRef.current = true;
    generateSubtitles();
  }, [
    audioTimelineClips,
    autoTranscriptionRequested,
    generateSubtitles,
    isEditorStateReady,
    subtitles,
    videoTimelineClips
  ]);

  // Turn the clicks recorded during a screen capture into editable 2x zooms on
  // the zoom lane. Runs once, and never over zooms that already exist.
  useEffect(() => {
    if (!autoTranscriptionRequested || !isEditorStateReady || autoZoomStartedRef.current) return;
    if (projectId === null || zoomEffects.length > 0) return;
    autoZoomStartedRef.current = true;
    void (async () => {
      const capture = await window.openVideoCraft.capture.clicks(projectId);
      if (capture.clicks.length === 0) return;
      const durationSeconds = timelineDuration > 0
        ? timelineDuration
        : Math.max(0, (project?.durationMs ?? 0) / 1000);
      const effects = generateAutoZoomEffects({
        clicks: capture.clicks,
        displays: capture.displays,
        durationSeconds,
        displayId: capture.displayId ?? undefined
      });
      if (effects.length > 0) setZoomEffects(effects);
    })();
  }, [
    autoTranscriptionRequested,
    isEditorStateReady,
    projectId,
    project,
    setZoomEffects,
    timelineDuration,
    zoomEffects
  ]);

  // The single write path for media clip selection: pointer presses, keyboard
  // activation, right-click, and trims all land here so the inspector item,
  // the other timed selections, and the marquee stay consistent.
  function applyTimelineClipSelection(
    segmentIds: string[],
    primaryId: string | null,
    options: { keepRange?: boolean } = {}
  ) {
    setSelectedZoomId(null);
    setSelectedSpeedId(null);
    setSelectedSubtitleId(null);
    setSelectedTextOverlayId(null);
    setSelectedTransitionId(null);
    setTimelineContextMenu(null);
    setSelectedTimelineSegmentIds(segmentIds);
    setSelectedTimelineSegmentId(primaryId);
    if (!options.keepRange) setTimelineRangeSelection(null);
    const primary = primaryId
      ? timelineSegments.find((segment) => segment.id === primaryId)
      : null;
    if (primary) setSelectedItemId(primary.itemId);
  }

  const linkedTimelineSegmentIds = getLinkedRecordingAudioIdsForSelection(
    timelineSegments,
    selectedTimelineSegmentIds
  );

  // The context menu's Hide/Show item addresses the same clips its action does:
  // the whole selection when the menu was opened on one of its clips, otherwise
  // the clip under the press.
  const contextMenuVisibilityClipIds = timelineContextMenu
    ? resolveVisibilityToggleClipIds(
        selectedTimelineSegmentIds,
        timelineContextMenu.segmentId
      )
    : [];
  const contextMenuClipsHidden = areTimelineSegmentsHidden(
    timelineSegments,
    contextMenuVisibilityClipIds
  );
  // Closing gaps acts on the selection when the menu was opened inside it, and
  // on the addressed clip's whole channel otherwise.
  const contextMenuCloseGapsIds = timelineContextMenu?.segmentId
    ? selectedTimelineSegmentIds.includes(timelineContextMenu.segmentId)
      ? selectedTimelineSegmentIds
      : timelineSegments
          .filter(
            (segment) =>
              segment.track === "video" &&
              segment.hidden !== true &&
              segment.lane ===
                timelineSegments.find((item) => item.id === timelineContextMenu?.segmentId)?.lane
          )
          .map((segment) => segment.id)
    : [];

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

  const setClipEdgeTransition = (input: Omit<ClipEdgeTransition, "id">) => {
    const edgeId = `${input.segmentId}:${input.edge}:edge-transition`;
    setEdgeTransitions((current) => {
      const next = [
        ...current.filter((item) =>
          item.segmentId !== input.segmentId || item.edge !== input.edge
        ),
        { ...input, id: edgeId }
      ];
      try {
        validateClipEdgeTransitions(timelineSegments, next);
        setError(null);
        return next;
      } catch (edgeError) {
        setError(edgeError instanceof Error ? edgeError.message : String(edgeError));
        return current;
      }
    });
  };

  const removeClipEdgeTransition = (id: string) => {
    setEdgeTransitions((current) => current.filter((item) => item.id !== id));
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
          onSave={() => void saveState()}
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
                    onRecordAudio={() => void (projectRecorder.kind === "audio" ? projectRecorder.stop() : projectRecorder.start("audio"))}
                    onRecordVideo={() => void (projectRecorder.kind === "video" ? projectRecorder.stop() : projectRecorder.start("video"))}
                    recordingKind={projectRecorder.kind}
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
            screenCrop={screenCrop}
            cameraBackgroundStatus={cameraBackground.status}
            cameraMatteReady={cameraBackground.matteUrl !== null}
            onPrepareCameraBackground={() => void cameraBackground.prepare()}
            onCancelCameraBackground={() => void cameraBackground.cancel()}
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
            edgeTransitions={edgeTransitions}
            selectedTransitionId={selectedTransitionId}
            selectedSegmentId={selectedTimelineSegmentId}
            videoClips={videoTimelineClips}
            sttDownloadProgress={sttDownloadProgress}
            sttStatus={sttStatus}
            sttModelLabel={whisperTranscriptionModelLabel}
            sttProvider={sttProvider}
            providerKeys={providerKeys}
            audioCleanup={audioCleanup}
            onSetAudioCleanup={(itemId, settings) => setAudioCleanup((current) => {
              const next = { ...current };
              if (settings === null) delete next[itemId];
              else next[itemId] = settings;
              return next;
            })}
            assistantProvider={assistantProvider}
            onAssistantProviderChange={setAssistantProvider}
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
            assistantMessages={activeChat.messages}
            assistantSending={activeChat.sending}
            assistantStatusMessage={activeChat.statusMessage}
            assistantError={activeChat.chatError}
            onAssistantSend={(message) => void activeChat.send(message)}
            onAssistantCancel={activeChat.cancel}
            onAssistantReset={() => void activeChat.reset()}
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
            onScreenCropChange={setScreenCrop}
            onApplyLayoutToClips={() => setSelectedClipsLayout(layoutMode)}
            onClearClipLayout={() => setSelectedClipsLayout(null)}
            onApplyCameraStyleToClips={() =>
              setSelectedClipsCameraStyle({ shape: cameraShape, border: cameraBorderStyle })
            }
            onClearClipCameraStyle={() => setSelectedClipsCameraStyle(null)}
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
            onSetEdgeTransition={setClipEdgeTransition}
            onRemoveEdgeTransition={removeClipEdgeTransition}
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
            edgeTransitions={edgeTransitions}
            audioTimelineClips={audioTimelineClips}
            previewCameraItem={previewCameraItem}
            previewCameraClip={previewCameraClip}
            showNoCameraRecording={showNoCameraRecording}
            screenStyle={screenStyle}
            screenContentStyle={screenContentStyle}
            cameraMaskUrl={cameraMaskUrl}
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
            cleanupClips={cleanupVideoClips}
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
          onZoomChange={setTimelineZoom}
          onZoomWheel={zoomTimelineWithWheel}
          onRulerPointerDown={beginTimelineRulerPointer}
          onRulerPointerMove={moveTimelineRulerPointer}
          onRulerPointerUp={endTimelineRulerPointer}
          onRulerPointerCancel={cancelTimelineRulerPointer}
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
          onToggleVideoLaneVisibility={toggleVideoLaneVisibility}
          onSwapVideoChannels={swapVideoChannels}
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
          linkedSegmentIds={linkedTimelineSegmentIds}
          rangeSelection={timelineRangeSelection}
          selectedZoomId={selectedZoomId}
          selectedSpeedId={selectedSpeedId}
          selectedSubtitleId={selectedSubtitleId}
          selectedTextOverlayId={selectedTextOverlayId}
          contextMenu={timelineContextMenu}
          canSplitAtContextMenu={
            timelineContextMenu
              ? (getContextMenuSplitSelectionIds(
                  timelineSegments,
                  selectedTimelineSegmentIds,
                  timelineContextMenu
                )?.length ?? 0) > 0 ||
                canSplitTimelineSegmentAt(timelineSegments, timelineContextMenu)
              : false
          }
          canSplitAtPlayhead={canSplitTimelineSelectionAt(
            timelineSegments,
            selectedTimelineSegmentIds,
            selectedTimelineSegmentId,
            currentTime
          )}
          canToggleHidden={contextMenuVisibilityClipIds.length > 0}
          selectedClipsHidden={contextMenuClipsHidden}
          onTogglePlayback={() => void togglePlayback()}
          onSeekFrame={seekFrame}
          onUndo={undoTimelineEdit}
          onRedo={redoTimelineEdit}
          onSplitAtPlayhead={() => splitSelectionAtPlayhead(currentTime)}
          onDeleteSelected={() => deleteSelectedTimelineSegment()}
          onSelectClip={(clip, additive) => {
            // Keyboard activation; pointer presses select through the drag hook.
            const press = resolveTimelineClipPress(
              selectedTimelineSegmentIds,
              clip.id,
              additive,
              getTimelineClipGroupIds(
                timelineSegments,
                clip.id
              )
            );
            applyTimelineClipSelection(
              press.collapseOnRelease ? [clip.id] : press.ids,
              press.primaryId
            );
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
            if (!timelineContextMenu) return;
            // Right-clicking inside a multi-selection cuts the whole selection, like delete does.
            const selectionIds = getContextMenuSplitSelectionIds(
              timelineSegments,
              selectedTimelineSegmentIds,
              timelineContextMenu
            );
            if (selectionIds) {
              splitSelectedTimelineSegments(timelineContextMenu.time, selectionIds);
            } else {
              splitTimelineSegment(timelineContextMenu.segmentId, timelineContextMenu.time);
            }
          }}
          onContextMenuDelete={() => {
            if (!timelineContextMenu) return;
            // Right-clicking inside a selection acts on the whole selection.
            if (
              timelineContextMenu.segmentId &&
              selectedTimelineSegmentIds.includes(timelineContextMenu.segmentId)
            ) {
              deleteSelectedTimelineSegment();
            } else {
              deleteTimelineSegment(timelineContextMenu.segmentId);
            }
          }}
          onContextMenuToggleHidden={() => {
            if (contextMenuVisibilityClipIds.length === 0) return;
            // Hide/Show stays one undoable step for the whole selection.
            toggleSelectedTimelineHidden(contextMenuVisibilityClipIds);
          }}
          onContextMenuCloseGaps={() => {
            if (contextMenuCloseGapsIds.length === 0) return;
            closeTimelineGaps(contextMenuCloseGapsIds);
          }}
        />
      </section>
    </main>
  );
}
