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
 * Pure timeline/zoom/media math lives in ./editor/{timeline,zoom,media}-utils.
 */
import { Download, Home, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type {
  ExportResolution,
  ExportVideoFormat,
  ExportVideoRequest,
  ProjectView
} from "../shared/types";
import appLogo from "./assets/app.png";
import {
  constrainZoomEnd,
  constrainZoomMove,
  constrainZoomStart,
  placeZoomInFirstGap,
  zoomMinDurationSeconds
} from "./zoom-timing";
import { ToolPanelHeader } from "./editor/controls";
import { ExportDialog } from "./editor/ExportDialog";
import { PreviewContent } from "./editor/PreviewContent";
import { Timeline } from "./editor/Timeline";
import { editorTools } from "./editor/tools";
import { AudioPanel } from "./editor/panels/AudioPanel";
import { CutPanel } from "./editor/panels/CutPanel";
import { LayoutPanel } from "./editor/panels/LayoutPanel";
import { MediaPanel } from "./editor/panels/MediaPanel";
import { StylePanel } from "./editor/panels/StylePanel";
import { SubtitlesPanel } from "./editor/panels/SubtitlesPanel";
import { ZoomPanel } from "./editor/panels/ZoomPanel";
import {
  canDriftSeek,
  createProjectMedia,
  decodeAudioTo16kMono,
  toEditorMediaItem
} from "./editor/media-utils";
import {
  areTimelineSegmentsEqual,
  calculateTimelineDuration,
  canSplitTimelineSegment,
  canSplitTimelineSegmentAt,
  createAudioTimelineTracks,
  createClipPlaybackKey,
  createTimelineMediaClips,
  findTimelineSegmentAtTime,
  getTimelineMediaDuration,
  getTimelineTrackKind,
  moveTimelineSegment,
  resolveAudioLane,
  syncTimelineSegments,
  trimTimelineSegment
} from "./editor/timeline-utils";
import { clampNumber, createId, formatBytes } from "./editor/utils";
import { getActiveZoom, isZoomActiveAtTime } from "./editor/zoom-utils";
import { frameRate, mediaDragType } from "./editor/types";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  MediaPanel as MediaPanelTab,
  ScreenLayoutDrag,
  ScreenLayoutDragMode,
  SubtitleSegment,
  SubtitleStyle,
  TimelineContextMenu,
  TimelineMediaClip,
  TimelineSegment,
  TimelineTrimDrag,
  TimelineTrimEdge,
  VideoCornerStyle,
  ZoomEffect
} from "./editor/types";

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
  const [cameraSize, setCameraSize] = useState(24);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>("bottom-right");
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
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
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
  const [exportFormat, setExportFormat] = useState<ExportVideoFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubbingTimeline, setScrubbingTimeline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineViewDuration, setTimelineViewDuration] = useState(0);

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const videoClipsRef = useRef<TimelineMediaClip[]>([]);
  const audioClipsRef = useRef<TimelineMediaClip[]>([]);
  const zoomEffectsRef = useRef<ZoomEffect[]>([]);
  const syncedVideoClipKeyRef = useRef<string | null>(null);
  const syncedCameraClipKeyRef = useRef<string | null>(null);
  const masterVolumeRef = useRef(100);
  const audioLevelsRef = useRef<Record<string, { volume: number; muted: boolean }>>({});
  const timelineDurationRef = useRef(0);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
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
  const screenLayoutDragRef = useRef<ScreenLayoutDrag | null>(null);
  const previousTimelineDurationRef = useRef(0);
  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());
  const saveStateRef = useRef<() => void>(() => undefined);
  const restoredRef = useRef(false);

  const stateStorageKey = projectId ? `ovc-editor-state:${projectId}` : null;

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void window.openVideoCraft.projects
      .get(projectId)
      .then(setProject)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, [projectId]);

  // Restore a previously saved editing session (once) for this project.
  useEffect(() => {
    if (restoredRef.current || !stateStorageKey) {
      return;
    }
    restoredRef.current = true;

    const raw = localStorage.getItem(stateStorageKey);
    if (!raw) {
      return;
    }

    try {
      const snapshot = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(snapshot.timelineSegments)) {
        const segments = snapshot.timelineSegments as TimelineSegment[];
        setTimelineSegments(segments);
        for (const segment of segments) {
          knownTimelineItemIdsRef.current.add(segment.itemId);
        }
      }
      if (Array.isArray(snapshot.zoomEffects)) setZoomEffects(snapshot.zoomEffects as ZoomEffect[]);
      if (Array.isArray(snapshot.subtitles)) setSubtitles(snapshot.subtitles as SubtitleSegment[]);
      if (snapshot.subtitleStyle) setSubtitleStyle(snapshot.subtitleStyle as SubtitleStyle);
      if (snapshot.layoutMode) setLayoutMode(snapshot.layoutMode as LayoutMode);
      if (snapshot.backgroundStyle) setBackgroundStyle(snapshot.backgroundStyle as BackgroundStyle);
      if (snapshot.activeBackgroundCategory)
        setActiveBackgroundCategory(snapshot.activeBackgroundCategory as BackgroundCategory);
      if (typeof snapshot.cameraSize === "number") setCameraSize(snapshot.cameraSize);
      if (snapshot.cameraPosition) setCameraPosition(snapshot.cameraPosition as CameraPosition);
      if (snapshot.cameraShape) setCameraShape(snapshot.cameraShape as CameraShape);
      if (snapshot.cameraBorderStyle)
        setCameraBorderStyle(snapshot.cameraBorderStyle as CameraBorderStyle);
      if (snapshot.videoCornerStyle)
        setVideoCornerStyle(snapshot.videoCornerStyle as VideoCornerStyle);
      if (snapshot.screenPosition)
        setScreenPosition(snapshot.screenPosition as { x: number; y: number; scale: number });
      if (typeof snapshot.masterVolume === "number") setMasterVolume(snapshot.masterVolume);
      if (snapshot.audioLevels && typeof snapshot.audioLevels === "object") {
        setAudioLevels(
          snapshot.audioLevels as Record<string, { volume: number; muted: boolean }>
        );
      }
    } catch {
      // corrupt snapshot — start fresh
    }
  }, [stateStorageKey]);

  // Persist the editable session (timeline, effects, look) to localStorage.
  const saveState = () => {
    if (!stateStorageKey) {
      return;
    }

    const snapshot = {
      v: 1,
      timelineSegments,
      zoomEffects,
      subtitles,
      subtitleStyle,
      layoutMode,
      backgroundStyle,
      activeBackgroundCategory,
      cameraSize,
      cameraPosition,
      cameraShape,
      cameraBorderStyle,
      videoCornerStyle,
      screenPosition,
      masterVolume,
      audioLevels
    };

    try {
      localStorage.setItem(stateStorageKey, JSON.stringify(snapshot));
      setError(null);
      setExportMessage("Project saved");
    } catch {
      setError("Could not save the project state.");
    }
  };
  saveStateRef.current = saveState;

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveStateRef.current();
      }
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);

  // Auto-dismiss the "Project saved" toast.
  useEffect(() => {
    if (exportMessage !== "Project saved") {
      return undefined;
    }

    const timeout = window.setTimeout(() => setExportMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [exportMessage]);

  // Screen layout drags (move/resize in the preview) track the pointer globally
  // so they keep working when the pointer leaves the preview frame.
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      updateScreenLayoutDrag(event.clientX, event.clientY);
    }

    function handlePointerUp() {
      finishScreenLayoutDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived data: media library, timeline clips, playback geometry.
  // ---------------------------------------------------------------------------

  const projectMedia = useMemo(() => createProjectMedia(project), [project]);
  const allMedia = useMemo(
    () => [...projectMedia, ...importedMedia],
    [importedMedia, projectMedia]
  );
  const selectedItem =
    allMedia.find((item) => item.id === selectedItemId) ?? allMedia[0] ?? null;
  const visibleMedia = allMedia.filter((item) =>
    activePanel === "all" ? true : item.kind === activePanel
  );
  const projectName = project?.name ?? "New Edit";
  const projectScreen = projectMedia.find((item) => item.track === "screen") ?? null;
  const projectCamera = projectMedia.find((item) => item.track === "camera") ?? null;
  const activeDuration =
    duration > 0 ? duration : selectedItem?.duration ?? (project?.durationMs ?? 0) / 1000;
  const selectedTimelineItemId = selectedItem?.id ?? null;
  // Items that may appear on the timeline (the camera feed rides along with the
  // screen recording and is never an independent clip).
  const timelineEditableItems = useMemo(
    () =>
      allMedia.filter(
        (item) =>
          item.kind === "audio" ||
          ((item.kind === "video" || item.kind === "image") && item.track !== "camera")
      ),
    [allMedia]
  );
  const mediaById = useMemo(
    () => new Map(allMedia.map((item) => [item.id, item])),
    [allMedia]
  );
  const mediaDurationById = useMemo(
    () =>
      new Map(
        timelineEditableItems.map((item) => [
          item.id,
          getTimelineMediaDuration(item, activeDuration, selectedTimelineItemId)
        ])
      ),
    [activeDuration, selectedTimelineItemId, timelineEditableItems]
  );
  const timelineClips = useMemo(
    () => createTimelineMediaClips(timelineSegments, mediaById),
    [mediaById, timelineSegments]
  );
  const videoTimelineClips = useMemo(
    () => timelineClips.filter((clip) => clip.track === "video"),
    [timelineClips]
  );
  const audioTimelineClips = useMemo(
    () => timelineClips.filter((clip) => clip.track === "audio"),
    [timelineClips]
  );
  const audioTimelineTracks = useMemo(
    () => createAudioTimelineTracks(audioTimelineClips),
    [audioTimelineClips]
  );
  // The video clip under the playhead — this is what the preview shows.
  const activeVideoClip = useMemo(
    () =>
      videoTimelineClips.find(
        (clip) => currentTime >= clip.start && currentTime < clip.start + clip.duration
      ) ?? null,
    [videoTimelineClips, currentTime]
  );
  const previewItem = activeVideoClip?.item ?? null;
  const isProjectCompositionSelected = Boolean(
    previewItem && previewItem.origin === "project" && previewItem.track === "screen"
  );
  const timelineDuration = calculateTimelineDuration(
    videoTimelineClips,
    audioTimelineClips,
    zoomEffects,
    subtitles,
    activeDuration
  );
  // The rendered timeline scale never shrinks: trimming or deleting a clip
  // leaves an empty gap (for future clips) instead of rescaling everything.
  const timelineRenderDuration = Math.max(timelineViewDuration, timelineDuration);
  const totalFrames = Math.max(1, Math.floor(timelineRenderDuration * frameRate));
  const currentFrame = Math.min(totalFrames, Math.max(0, Math.round(currentTime * frameRate)));
  const playheadPercent =
    timelineRenderDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / timelineRenderDuration) * 100))
      : 0;
  const activeZoom = getActiveZoom(zoomEffects, currentTime);
  const activeSubtitle =
    subtitles.find((subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end) ??
    null;
  const selectedSubtitle =
    subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? subtitles[0] ?? null;
  const selectedZoomEffect =
    zoomEffects.find((effect) => effect.id === selectedZoomId) ?? null;
  const audioSources = allMedia.filter((item) => item.kind === "audio");
  const selectedTimelineClip =
    timelineClips.find((clip) => clip.id === selectedTimelineSegmentId) ?? null;
  // The preview's screen transform combines the user layout scale/offset with
  // the currently animating zoom effect.
  const screenScale = (screenPosition.scale / 100) * activeZoom.scale;
  const screenStyle: CSSProperties = {
    transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
      3
    )})`,
    transformOrigin: `${activeZoom.originX}% ${activeZoom.originY}%`
  };
  const screenEditEnabled = activeTool === "layout" && layoutMode !== "camera-only";
  const previewFrameStyle = {
    "--camera-size": `${cameraSize}%`,
    ...(backgroundStyle === "custom" && customBackgroundUrl
      ? {
          backgroundImage: `linear-gradient(135deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.34)), url("${customBackgroundUrl}")`
        }
      : {})
  } as CSSProperties;
  const previewClassName = [
    "preview-composition-frame",
    `preview-layout-${layoutMode}`,
    `preview-style-${backgroundStyle}`,
    `preview-camera-position-${cameraPosition}`,
    `preview-camera-shape-${cameraShape}`,
    `preview-camera-border-${cameraBorderStyle}`,
    `preview-corner-${videoCornerStyle}`
  ].join(" ");
  // The timeline is the drop target for assets, so it must be visible on the
  // "media" (Setup) tool as well — otherwise the asset grid and the timeline
  // are never on screen together and there is nothing to drag onto.
  const timelineVisible =
    activeTool === "media" ||
    activeTool === "cut" ||
    activeTool === "zoom" ||
    activeTool === "audio" ||
    activeTool === "subtitles";

  useEffect(() => {
    if (!screenEditEnabled) {
      finishScreenLayoutDrag();
    }
  }, [screenEditEnabled]);

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

  useEffect(() => {
    syncTimelinePlaybackRefs(timelineSegments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDuration, mediaById, subtitles, timelineSegments, zoomEffects]);

  useEffect(() => {
    zoomEffectsRef.current = zoomEffects;
  }, [zoomEffects]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    audioLevelsRef.current = audioLevels;
  }, [audioLevels]);

  useEffect(() => {
    timelineDurationRef.current = timelineDuration;
  }, [timelineDuration]);

  // Grow (never shrink) the rendered timeline scale as content grows.
  useEffect(() => {
    setTimelineViewDuration((current) => Math.max(current, timelineDuration));
  }, [timelineDuration]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    syncMediaToTime(currentTimeRef.current, playingRef.current, true);
    // The media element is swapped by React when the active clip/source changes;
    // sync after commit so the new element starts at the timeline time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeVideoClip?.id,
    activeVideoClip?.start,
    activeVideoClip?.duration,
    activeVideoClip?.sourceStart,
    previewItem?.url,
    projectCamera?.url,
    layoutMode
  ]);

  // Master playback clock: advances the global timeline time while playing and
  // keeps every media element slaved to it (see syncMediaToTime).
  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let last = performance.now();
    let lastUiUpdate = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = currentTimeRef.current + dt;

      if (next >= timelineDurationRef.current) {
        currentTimeRef.current = timelineDurationRef.current;
        setCurrentTime(timelineDurationRef.current);
        syncMediaToTime(timelineDurationRef.current, false, true);
        setPlaying(false);
        return;
      }

      currentTimeRef.current = next;
      // Sync media every frame for tight A/V alignment, but throttle the (heavy)
      // React re-render that moves the playhead/UI to ~30fps.
      syncMediaToTime(next, true);
      const frameInterval = isZoomActiveAtTime(zoomEffectsRef.current, next) ? 16 : 33;
      if (now - lastUiUpdate >= frameInterval) {
        lastUiUpdate = now;
        setCurrentTime(next);
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Apply volume changes immediately to the live media elements.
  useEffect(() => {
    const master = Math.min(1, Math.max(0, masterVolume / 100));
    if (mainVideoRef.current) {
      mainVideoRef.current.volume = master;
    }
    for (const clip of audioTimelineClips) {
      const element = audioElsRef.current.get(clip.id);
      if (!element) {
        continue;
      }
      const level = audioLevels[clip.item.id] ?? { volume: 100, muted: false };
      element.volume = level.muted ? 0 : Math.min(1, master * (level.volume / 100));
    }
  }, [masterVolume, audioLevels, audioTimelineClips]);

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
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

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
        void togglePlayback();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (activeTool === "zoom" && selectedZoomId) {
          removeZoomEffect(selectedZoomId);
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
    selectedZoomId,
    timelineRedoStack,
    timelineSegments,
    timelineUndoStack
  ]);

  // ---------------------------------------------------------------------------
  // Media library actions.
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Playback: a rAF clock drives the timeline time; media elements are slaves.
  // ---------------------------------------------------------------------------

  function effectiveClipVolume(itemId: string): number {
    const master = Math.max(0, masterVolumeRef.current / 100);
    const level = audioLevelsRef.current[itemId] ?? { volume: 100, muted: false };
    if (level.muted) {
      return 0;
    }
    return Math.min(1, master * (level.volume / 100));
  }

  // Slave every media element to the global timeline time `t`. The main video
  // element shows whichever video clip is under the playhead; each audio clip
  // plays when the playhead is inside it. Elements only hard-seek when they
  // drift more than ~0.3s so normal playback stays smooth.
  function syncMediaToTime(t: number, isPlaying: boolean, forceSeek = false) {
    const master = Math.min(1, Math.max(0, masterVolumeRef.current / 100));
    const videoClip =
      videoClipsRef.current.find(
        (clip) => t >= clip.start && t < clip.start + clip.duration
      ) ?? null;

    const videoEl = mainVideoRef.current;
    if (videoEl && videoClip && videoClip.item.kind === "video") {
      const desired = videoClip.sourceStart + (t - videoClip.start);
      const clipPlaybackKey = createClipPlaybackKey(videoClip);
      const clipChanged = syncedVideoClipKeyRef.current !== clipPlaybackKey;
      syncedVideoClipKeyRef.current = clipPlaybackKey;
      // Drift correction must wait for in-flight seeks: re-seeking every frame
      // while the element is still seeking freezes playback on a single frame.
      if (
        Number.isFinite(desired) &&
        (forceSeek || clipChanged || (canDriftSeek(videoEl) && Math.abs(videoEl.currentTime - desired) > 0.3))
      ) {
        try {
          videoEl.currentTime = desired;
        } catch {
          // element not ready yet
        }
      }
      // Screen recordings carry no (or duplicate) audio — the mic track plays as
      // its own audio clip — so mute them, but keep imported video audio.
      videoEl.muted = videoClip.item.origin === "project";
      videoEl.volume = master;
      if (isPlaying && videoEl.paused) {
        void videoEl.play().catch(() => undefined);
      } else if (!isPlaying && !videoEl.paused) {
        videoEl.pause();
      }
    } else if (videoEl && !videoEl.paused) {
      videoEl.pause();
      syncedVideoClipKeyRef.current = null;
    } else if (!videoClip) {
      syncedVideoClipKeyRef.current = null;
    }

    const cameraEl = cameraRef.current;
    if (cameraEl && videoClip) {
      const desired = videoClip.sourceStart + (t - videoClip.start);
      const clipPlaybackKey = createClipPlaybackKey(videoClip);
      const clipChanged = syncedCameraClipKeyRef.current !== clipPlaybackKey;
      syncedCameraClipKeyRef.current = clipPlaybackKey;
      if (
        Number.isFinite(desired) &&
        (forceSeek || clipChanged || (canDriftSeek(cameraEl) && Math.abs(cameraEl.currentTime - desired) > 0.3))
      ) {
        try {
          cameraEl.currentTime = desired;
        } catch {
          // element not ready yet
        }
      }
      if (isPlaying && cameraEl.paused) {
        void cameraEl.play().catch(() => undefined);
      } else if (!isPlaying && !cameraEl.paused) {
        cameraEl.pause();
      }
    } else {
      syncedCameraClipKeyRef.current = null;
    }

    for (const clip of audioClipsRef.current) {
      const el = audioElsRef.current.get(clip.id);
      if (!el) {
        continue;
      }

      const active = t >= clip.start && t < clip.start + clip.duration;
      if (active) {
        const desired = clip.sourceStart + (t - clip.start);
        if (
          Number.isFinite(desired) &&
          (forceSeek || (canDriftSeek(el) && Math.abs(el.currentTime - desired) > 0.3))
        ) {
          try {
            el.currentTime = desired;
          } catch {
            // element not ready yet
          }
        }
        el.volume = effectiveClipVolume(clip.item.id);
        if (isPlaying && el.paused) {
          void el.play().catch(() => undefined);
        } else if (!isPlaying && !el.paused) {
          el.pause();
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
  }

  function togglePlayback() {
    if (playing) {
      setPlaying(false);
      syncMediaToTime(currentTimeRef.current, false, true);
      return;
    }

    let startAt = currentTimeRef.current;
    if (startAt >= timelineDuration - 0.05) {
      startAt = 0;
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    syncMediaToTime(startAt, true, true);
    setPlaying(true);
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, timelineDuration || value));
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current, true);
  }

  // Selecting an asset also jumps the playhead to its first clip (if any).
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

  function seekFrame(frame: number) {
    const nextFrame = Math.max(0, Math.min(frame, totalFrames));
    seek(nextFrame / frameRate);
  }

  // Convert a pointer X coordinate into timeline seconds using the clip lane's
  // bounds (the lane, not the body, so the label column is excluded).
  function getTimelineTimeFromClientX(clientX: number): number | null {
    const timelineBody = timelineBodyRef.current;
    if (!timelineBody || timelineRenderDuration <= 0) {
      return null;
    }

    const lane = timelineBody.querySelector<HTMLElement>(".track-lane");
    const bounds = lane?.getBoundingClientRect() ?? timelineBody.getBoundingClientRect();
    if (bounds.width <= 0) {
      return null;
    }

    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    return progress * timelineRenderDuration;
  }

  function seekTimelinePointer(clientX: number) {
    const nextTime = getTimelineTimeFromClientX(clientX);
    if (nextTime === null) {
      return;
    }

    seek(nextTime);
  }

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
  // Screen layout drag (move/resize the screen video inside the preview).
  // ---------------------------------------------------------------------------

  function beginScreenLayoutDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) {
    if (event.button !== 0 || activeTool !== "layout" || layoutMode === "camera-only") {
      return;
    }

    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const overlay = target?.classList.contains("studio-screen-edit-overlay")
      ? target
      : target?.closest<HTMLElement>(".studio-screen-edit-overlay");
    const bounds = overlay?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    screenLayoutDragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: screenPosition,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height
    };
  }

  function updateScreenLayoutDrag(clientX: number, clientY: number) {
    const drag = screenLayoutDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    if (drag.mode === "move") {
      setScreenPosition({
        ...drag.startPosition,
        x: clampNumber(drag.startPosition.x + (deltaX / drag.boundsWidth) * 100, -120, 120),
        y: clampNumber(drag.startPosition.y + (deltaY / drag.boundsHeight) * 100, -120, 120)
      });
      return;
    }

    // Corner resize: average the two axes' movement into a scale delta.
    const direction = getScreenResizeDirection(drag.mode);
    const scaleDelta =
      (((deltaX * direction.x) / drag.boundsWidth +
        (deltaY * direction.y) / drag.boundsHeight) /
        2) *
      100;
    setScreenPosition({
      ...drag.startPosition,
      scale: clampNumber(drag.startPosition.scale + scaleDelta, 35, 220)
    });
  }

  function finishScreenLayoutDrag() {
    screenLayoutDragRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Timeline editing: commit (with undo), trim, move, split, delete, scrub.
  // ---------------------------------------------------------------------------

  // Recompute the playback refs (clip lists + duration) for a segment list so
  // the rAF clock sees edits immediately, without waiting for a re-render.
  function syncTimelinePlaybackRefs(segments: TimelineSegment[]): number {
    const nextTimelineClips = createTimelineMediaClips(segments, mediaById);
    const nextVideoClips = nextTimelineClips.filter((clip) => clip.track === "video");
    const nextAudioClips = nextTimelineClips.filter((clip) => clip.track === "audio");
    const nextTimelineDuration = calculateTimelineDuration(
      nextVideoClips,
      nextAudioClips,
      zoomEffects,
      subtitles,
      activeDuration
    );

    videoClipsRef.current = nextVideoClips;
    audioClipsRef.current = nextAudioClips;
    timelineDurationRef.current = nextTimelineDuration;
    return nextTimelineDuration;
  }

  function forceSyncCurrentTimelineMedia() {
    const safeDuration = Math.max(timelineDurationRef.current, 1);
    const nextTime = clampNumber(currentTimeRef.current, 0, safeDuration);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current, true);
  }

  function scheduleTimelinePlaybackSync(segments: TimelineSegment[]) {
    syncTimelinePlaybackRefs(segments);
    window.queueMicrotask(forceSyncCurrentTimelineMedia);
  }

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

  // Pointer handlers on the timeline body dispatch to whichever drag is active
  // (trim / zoom / move) and otherwise treat the pointer as a playhead scrub.
  function beginTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (timelineTrimDragRef.current || timelineMoveDragRef.current || zoomDragRef.current) {
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
    timelineDragRef.current = false;
    setScrubbingTimeline(false);
  }

  // ---------------------------------------------------------------------------
  // Duration bookkeeping, zoom effects, subtitles, audio levels.
  // ---------------------------------------------------------------------------

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
    setZoomEffects((current) => {
      const next = [...current, nextEffect];
      zoomEffectsRef.current = next;
      return next;
    });
    setSelectedZoomId(nextEffect.id);
    setActiveTool("zoom");
  }

  function updateZoomEffect(id: string, updates: Partial<ZoomEffect>) {
    setZoomEffects((current) => {
      const next = current.map((effect) => (effect.id === id ? { ...effect, ...updates } : effect));
      zoomEffectsRef.current = next;
      return next;
    });
  }

  function removeZoomEffect(id: string) {
    setZoomEffects((current) => {
      const next = current.filter((effect) => effect.id !== id);
      zoomEffectsRef.current = next;
      return next;
    });
    setSelectedZoomId((current) => (current === id ? null : current));
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
        "Xenova/whisper-tiny.en"
      )) as unknown as (
        input: Float32Array,
        options: Record<string, unknown>
      ) => Promise<{ chunks?: Array<{ timestamp: [number, number | null]; text: string }> }>;

      const output = await transcriber(audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5
      });

      const chunks = output.chunks ?? [];
      const segments: SubtitleSegment[] = chunks
        .filter((chunk) => chunk.text && chunk.text.trim().length > 0)
        .map((chunk, index, all) => {
          const start = Math.max(0, chunk.timestamp?.[0] ?? 0);
          const rawEnd = chunk.timestamp?.[1] ?? all[index + 1]?.timestamp?.[0] ?? start + 2;
          return {
            id: createId("subtitle"),
            start,
            end: Math.max(start + 0.4, rawEnd),
            text: chunk.text.trim()
          };
        });

      if (segments.length > 0) {
        setSubtitles(segments);
        setSelectedSubtitleId(segments[0].id);
      } else {
        setError("No speech was detected in the audio.");
      }
      setSttStatus("done");
    } catch (sttError) {
      setError(
        `Speech-to-text failed: ${
          sttError instanceof Error ? sttError.message : String(sttError)
        }`
      );
      setSttStatus("error");
    }
  }

  function updateSubtitle(id: string, updates: Partial<SubtitleSegment>) {
    setSubtitles((current) =>
      current.map((subtitle) => (subtitle.id === id ? { ...subtitle, ...updates } : subtitle))
    );
  }

  function setAudioLevel(itemId: string, patch: Partial<{ volume: number; muted: boolean }>) {
    setAudioLevels((current) => {
      const previous = current[itemId] ?? { volume: 100, muted: false };
      return { ...current, [itemId]: { ...previous, ...patch } };
    });
  }

  // ---------------------------------------------------------------------------
  // Export.
  // ---------------------------------------------------------------------------

  function getExportSource(): ExportVideoRequest["source"] | null {
    if (selectedItem?.origin === "imported" && selectedItem.kind === "video") {
      return {
        kind: "import",
        importId: selectedItem.importId ?? selectedItem.id
      };
    }

    if (project && projectScreen) {
      return {
        kind: "project",
        projectId: project.id
      };
    }

    return null;
  }

  async function exportCurrentVideo() {
    const source = getExportSource();

    if (!source) {
      setError("Select a video clip before exporting.");
      return;
    }

    setError(null);
    setExportMessage(null);
    setExporting(true);

    try {
      const result = await window.openVideoCraft.editor.exportVideo({
        source,
        format: exportFormat,
        resolution: exportResolution,
        trimStart: trimRange.start,
        trimEnd: trimRange.end > trimRange.start ? trimRange.end : null,
        volume: masterVolume / 100,
        backgroundAudioImportIds: backgroundAudioIds
      });

      if (result) {
        setExportMessage(`Exported ${formatBytes(result.bytesWritten)} to ${result.path}`);
        setExportDialogOpen(false);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  const activeToolMeta = editorTools.find((tool) => tool.id === activeTool);

  return (
    <main className="editor-root">
      <section
        className={`studio-shell ${
          timelineVisible ? "studio-shell-timeline-visible" : "studio-shell-timeline-hidden"
        }`}
      >
        <header className="studio-topbar">
          <div className="studio-brand">
            <div className="studio-brand-mark">
              <img src={appLogo} alt="" />
            </div>
            <div>
              <strong>Open Video Craft</strong>
              <small>Video Editor</small>
            </div>
          </div>

          <button className="studio-project-select" type="button">
            <span>{projectName}</span>
          </button>

          <div className="studio-top-actions">
            <button
              className="studio-icon-button"
              type="button"
              title="Back to main menu"
              onClick={() => void window.openVideoCraft.windows.openMain()}
            >
              <Home size={17} />
            </button>
            <button
              className="studio-icon-button"
              type="button"
              title="Save project (Ctrl+S)"
              onClick={saveState}
            >
              <Save size={17} />
            </button>
            <button
              className="studio-export-button"
              type="button"
              disabled={exporting || !getExportSource()}
              onClick={() => setExportDialogOpen(true)}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        {exportDialogOpen ? (
          <ExportDialog
            exportFormat={exportFormat}
            exportResolution={exportResolution}
            exporting={exporting}
            onClose={() => {
              if (!exporting) {
                setExportDialogOpen(false);
              }
            }}
            onExport={() => void exportCurrentVideo()}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
          />
        ) : null}

        {error ? (
          <div className="studio-error" role="alert">
            {error}
          </div>
        ) : null}
        {exportMessage ? (
          <div className="studio-success" role="status" aria-live="polite">
            {exportMessage}
          </div>
        ) : null}

        <div className="studio-workspace">
          {/* Left rail: tool switcher. */}
          <aside className="studio-rail" aria-label="Editor tools">
            {editorTools.map((tool) => (
              <button
                className={activeTool === tool.id ? "studio-rail-active" : ""}
                type="button"
                title={tool.label}
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
              >
                <img src={tool.image} alt="" aria-hidden="true" />
                <span>{tool.label}</span>
              </button>
            ))}
          </aside>

          {/* Tool panel: one small component per tool. */}
          <aside className={`tool-panel ${activeTool === "layout" ? "tool-panel-layout" : ""}`}>
            <ToolPanelHeader
              icon={activeToolMeta?.icon}
              title={activeToolMeta?.label ?? "Tools"}
            />

            {activeTool === "media" ? (
              <MediaPanel
                activeTab={activePanel}
                visibleMedia={visibleMedia}
                selectedItemId={selectedItem?.id ?? null}
                onImport={() => void importMedia()}
                onTabChange={setActivePanel}
                onSelectItem={selectTimelineItem}
                onItemDuration={updateMediaDuration}
                onRemoveItem={removeImportedMedia}
              />
            ) : null}

            {activeTool === "layout" ? (
              <LayoutPanel
                layoutMode={layoutMode}
                screenScale={screenPosition.scale}
                cameraShape={cameraShape}
                cameraBorderStyle={cameraBorderStyle}
                cameraPosition={cameraPosition}
                cameraSize={cameraSize}
                onLayoutModeChange={setLayoutMode}
                onScreenScaleChange={(scale) =>
                  setScreenPosition((current) => ({ ...current, scale }))
                }
                onCameraShapeChange={setCameraShape}
                onCameraBorderStyleChange={setCameraBorderStyle}
                onCameraPositionChange={setCameraPosition}
                onCameraSizeChange={setCameraSize}
              />
            ) : null}

            {activeTool === "audio" ? (
              <AudioPanel
                masterVolume={masterVolume}
                audioSources={audioSources}
                audioLevels={audioLevels}
                onMasterVolumeChange={setMasterVolume}
                onAddBackgroundMusic={() =>
                  void importMedia({ backgroundAudio: true, selectFirst: false })
                }
                onSelectItem={selectTimelineItem}
                onSetAudioLevel={setAudioLevel}
              />
            ) : null}

            {activeTool === "zoom" ? (
              <ZoomPanel
                previewItem={previewItem}
                selectedZoomEffect={selectedZoomEffect}
                onAddZoom={addZoomEffect}
                onUpdateZoom={updateZoomEffect}
                onRemoveZoom={removeZoomEffect}
              />
            ) : null}

            {activeTool === "subtitles" ? (
              <SubtitlesPanel
                sttStatus={sttStatus}
                subtitleStyle={subtitleStyle}
                subtitles={subtitles}
                selectedSubtitle={selectedSubtitle}
                onAddSubtitle={addSubtitle}
                onGenerateSubtitles={() => void generateSubtitles()}
                onStyleChange={setSubtitleStyle}
                onUpdateSubtitle={updateSubtitle}
                onSelectSubtitle={setSelectedSubtitleId}
              />
            ) : null}

            {activeTool === "cut" ? (
              <CutPanel
                selectedClip={selectedTimelineClip}
                onSplitAtPlayhead={() =>
                  splitTimelineSegment(selectedTimelineSegmentId, currentTime)
                }
                onDeleteSelected={deleteSelectedTimelineSegment}
              />
            ) : null}

            {activeTool === "style" ? (
              <StylePanel
                activeCategory={activeBackgroundCategory}
                backgroundStyle={backgroundStyle}
                videoCornerStyle={videoCornerStyle}
                onCategoryChange={setActiveBackgroundCategory}
                onBackgroundStyleChange={setBackgroundStyle}
                onUploadCustomBackground={() => void importCustomBackground()}
                onCornerStyleChange={setVideoCornerStyle}
              />
            ) : null}
          </aside>

          {/* Preview: shows whatever video/image clip is under the playhead. */}
          <section className="preview-panel">
            <div className="preview-canvas">
              <div className={previewClassName} style={previewFrameStyle}>
                {previewItem ? (
                  <PreviewContent
                    item={previewItem}
                    isProjectCompositionSelected={isProjectCompositionSelected}
                    projectCamera={projectCamera}
                    layoutMode={layoutMode}
                    screenStyle={screenStyle}
                    screenEditEnabled={screenEditEnabled}
                    activeSubtitle={activeSubtitle}
                    subtitleStyle={subtitleStyle}
                    currentTime={currentTime}
                    mainVideoRef={mainVideoRef}
                    cameraRef={cameraRef}
                    onScreenEditPointerDown={beginScreenLayoutDrag}
                    onMediaReady={() =>
                      syncMediaToTime(currentTimeRef.current, playingRef.current, true)
                    }
                    onDuration={(nextDuration) => {
                      updateDuration(nextDuration);
                      updateMediaDuration(previewItem.id, nextDuration);
                    }}
                    onSubtitleClick={(subtitleId) => {
                      setSelectedSubtitleId(subtitleId);
                      setActiveTool("subtitles");
                    }}
                  />
                ) : videoTimelineClips.length > 0 ? null : (
                  <div className="studio-video-empty">Import media or record a screen.</div>
                )}
              </div>
            </div>
            {/* Hidden audio elements — one per audio clip, driven by the clock. */}
            <div className="timeline-audio-players" aria-hidden="true">
              {audioTimelineClips.map((clip) => (
                <audio
                  key={clip.id}
                  src={clip.item.url}
                  preload="metadata"
                  onLoadedMetadata={(event) =>
                    updateMediaDuration(clip.item.id, event.currentTarget.duration)
                  }
                  ref={(element) => {
                    if (element) {
                      audioElsRef.current.set(clip.id, element);
                    } else {
                      audioElsRef.current.delete(clip.id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        </div>

        {timelineVisible ? (
          <Timeline
            bodyRef={timelineBodyRef}
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
            subtitles={subtitles}
            selectedSegmentId={selectedTimelineSegmentId}
            selectedZoomId={selectedZoomEffect?.id ?? null}
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
            onSelectSubtitle={(subtitleId) => {
              setSelectedSubtitleId(subtitleId);
              setActiveTool("subtitles");
            }}
            onTrimPointerDown={beginTimelineClipTrim}
            onMovePointerDown={beginTimelineClipMove}
            onZoomDragPointerDown={beginZoomClipDrag}
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
        ) : null}
      </section>
    </main>
  );
}

/** Maps a corner-resize handle to the drag direction that grows the screen. */
function getScreenResizeDirection(mode: ScreenLayoutDragMode): { x: number; y: number } {
  switch (mode) {
    case "resize-nw":
      return { x: -1, y: -1 };
    case "resize-ne":
      return { x: 1, y: -1 };
    case "resize-sw":
      return { x: -1, y: 1 };
    case "resize-se":
      return { x: 1, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}
