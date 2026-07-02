import {
  AudioLines,
  Captions,
  CircleStop,
  Download,
  Film,
  FolderOpen,
  Home,
  LayoutTemplate,
  MoreHorizontal,
  Music2,
  Palette,
  Play,
  Plus,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject
} from "react";
import type {
  ExportResolution,
  ExportVideoFormat,
  ExportVideoRequest,
  ImportedMediaFile,
  ImportedMediaKind,
  ProjectView
} from "../shared/types";
import setupIcon from "./assets/rail-icons/icon1.png";
import cutIcon from "./assets/rail-icons/icon2.png";
import layoutIcon from "./assets/rail-icons/icon3.png";
import zoomIcon from "./assets/rail-icons/icon4.png";
import styleIcon from "./assets/rail-icons/icon5.png";
import subtitleIcon from "./assets/rail-icons/icon6.png";
import audioIcon from "./assets/rail-icons/icon7.png";
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

type MediaPanel = "all" | "video" | "audio" | "image";
type EditorTool = "media" | "layout" | "audio" | "zoom" | "subtitles" | "cut" | "style";
type LayoutMode =
  | "screen-only"
  | "camera-only"
  | "bubble"
  | "bubble-fill"
  | "presenter"
  | "side-by-side"
  | "side-overlap";
type BackgroundStyle =
  | "real-world-1"
  | "real-world-2"
  | "real-world-3"
  | "gradient-1"
  | "gradient-2"
  | "gradient-3"
  | "animated-1"
  | "animated-2"
  | "animated-3"
  | "custom";
type BackgroundCategory = "animated" | "image" | "gradient";
type CameraPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
type CameraShape = "circle" | "rounded" | "square";
type CameraBorderStyle = "none" | "light" | "accent";
type VideoCornerStyle = "flat" | "soft" | "round";
type TimelineTrackKind = "video" | "audio";
type TimelineTrimEdge = "start" | "end";

type EditorMediaItem = {
  id: string;
  name: string;
  url: string;
  kind: ImportedMediaKind;
  origin: "project" | "imported";
  track: "screen" | "camera" | "audio" | "imported";
  duration: number | null;
  importId?: string;
};

type TimelineMediaClip = {
  id: string;
  item: EditorMediaItem;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  duration: number;
  sourceStart: number;
};

type TimelineSegment = {
  id: string;
  itemId: string;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  end: number;
  sourceStart: number;
};

type TimelineContextMenu = {
  x: number;
  y: number;
  time: number;
  segmentId: string | null;
} | null;

type TimelineTrimDrag = {
  segmentId: string;
  edge: TimelineTrimEdge;
  originalSegments: TimelineSegment[];
};

type ZoomSpeed = "slow" | "medium" | "fast";

type ZoomEffect = {
  id: string;
  start: number;
  end: number;
  speed: ZoomSpeed;
  scale: number;
  targetX: number;
  targetY: number;
};

type SubtitleStyle = "clean" | "karaoke" | "boxed" | "pop";

type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

const subtitleStyleOptions: Array<{ id: SubtitleStyle; label: string }> = [
  { id: "clean", label: "Clean" },
  { id: "karaoke", label: "Karaoke" },
  { id: "boxed", label: "Boxed" },
  { id: "pop", label: "Pop" }
];

const frameRate = 30;
const cameraSizeOptions = [
  { label: "S", value: 18 },
  { label: "M", value: 24 },
  { label: "L", value: 32 }
];
const cameraPositionOptions: CameraPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
];

function createRailIcon(background: string, foreground: string, pathData: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="#ffffff" stop-opacity=".18"/></linearGradient></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="url(#g)"/><rect x="6" y="6" width="36" height="36" rx="8" fill="none" stroke="#fff" stroke-opacity=".22"/><path d="${pathData}" fill="none" stroke="${foreground}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const editorTools: Array<{
  id: EditorTool;
  label: string;
  icon: ReactNode;
  image: string;
}> = [
  {
    id: "media",
    label: "Setup",
    icon: <FolderOpen size={18} />,
    image: setupIcon
  },
  {
    id: "cut",
    label: "Cut",
    icon: <Scissors size={18} />,
    image: cutIcon
  },
  {
    id: "layout",
    label: "Layout",
    icon: <LayoutTemplate size={18} />,
    image: layoutIcon
  },
  {
    id: "zoom",
    label: "Zoom",
    icon: <ZoomIn size={18} />,
    image: zoomIcon
  },
  {
    id: "style",
    label: "Style",
    icon: <Palette size={18} />,
    image: styleIcon
  },
  {
    id: "subtitles",
    label: "Subs",
    icon: <Captions size={18} />,
    image: subtitleIcon
  },
  {
    id: "audio",
    label: "Audio",
    icon: <Volume2 size={18} />,
    image: audioIcon
  }
];

const layoutPresetGroups: Array<{
  title: string;
  presets: Array<{
    id: LayoutMode;
    label: string;
    variant: string;
    featured?: boolean;
  }>;
}> = [
  {
    title: "Screen",
    presets: [
      { id: "screen-only", label: "Screen only", variant: "screen-only" },
      { id: "camera-only", label: "Camera only", variant: "camera-only" }
    ]
  },
  {
    title: "Camera Bubble",
    presets: [
      { id: "bubble", label: "Bubble on fit screen", variant: "bubble-a" },
      { id: "bubble-fill", label: "Bubble on filled screen", variant: "bubble-b", featured: true }
    ]
  },
  {
    title: "Side-by-Side",
    presets: [
      { id: "side-by-side", label: "Split left", variant: "split-a" },
      { id: "side-overlap", label: "Split left overlap", variant: "split-b" }
    ]
  },
  {
    title: "TV Presenter",
    presets: [
      { id: "presenter", label: "TV presenter", variant: "presenter-a", featured: true }
    ]
  }
];

const backgroundCategories: Array<{
  id: BackgroundCategory;
  label: string;
  options: Array<{ id: BackgroundStyle; label: string }>;
}> = [
  {
    id: "animated",
    label: "Animated",
    options: [
      { id: "animated-1", label: "Aurora" },
      { id: "animated-2", label: "Sunset" },
      { id: "animated-3", label: "Ocean" }
    ]
  },
  {
    id: "image",
    label: "Image",
    options: [
      { id: "real-world-1", label: "Desk" },
      { id: "real-world-2", label: "Studio" },
      { id: "real-world-3", label: "Nature" }
    ]
  },
  {
    id: "gradient",
    label: "Gradient",
    options: [
      { id: "gradient-1", label: "Violet" },
      { id: "gradient-2", label: "Teal" },
      { id: "gradient-3", label: "Ember" }
    ]
  }
];

const exportFormats: ExportVideoFormat[] = ["mp4", "webm", "mov"];
const exportResolutions: ExportResolution[] = ["source", "720p", "1080p", "1440p"];

export function EditorView() {
  const projectId = useMemo(
    () => new URLSearchParams(window.location.search).get("projectId"),
    []
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanel>("all");
  const [activeTool, setActiveTool] = useState<EditorTool>("layout");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("bubble");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("real-world-1");
  const [activeBackgroundCategory, setActiveBackgroundCategory] =
    useState<BackgroundCategory>("image");
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 88
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
  const [trimmingSegmentId, setTrimmingSegmentId] = useState<string | null>(null);
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

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const videoClipsRef = useRef<TimelineMediaClip[]>([]);
  const audioClipsRef = useRef<TimelineMediaClip[]>([]);
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
  const timelineContentEnd = Math.max(
    0,
    ...videoTimelineClips.map((clip) => clip.start + clip.duration),
    ...audioTimelineClips.map((clip) => clip.start + clip.duration),
    ...zoomEffects.map((effect) => effect.end),
    ...subtitles.map((subtitle) => subtitle.end)
  );
  const timelineDuration = Math.max(
    timelineContentEnd,
    timelineContentEnd > 0 ? 0 : activeDuration,
    1
  );
  const totalFrames = Math.max(1, Math.floor(timelineDuration * frameRate));
  const currentFrame = Math.min(totalFrames, Math.max(0, Math.round(currentTime * frameRate)));
  const playheadPercent =
    timelineDuration > 0 ? Math.min(100, Math.max(0, (currentTime / timelineDuration) * 100)) : 0;
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
  const backgroundAudioItems = importedMedia.filter((item) =>
    backgroundAudioIds.includes(item.id)
  );
  const screenScale =
    layoutMode === "bubble-fill" ||
    layoutMode === "side-by-side" ||
    layoutMode === "side-overlap" ||
    layoutMode === "camera-only"
      ? activeZoom.scale
      : (screenPosition.scale / 100) * activeZoom.scale;
  const screenStyle: CSSProperties =
    layoutMode === "bubble-fill" ||
    layoutMode === "side-by-side" ||
    layoutMode === "side-overlap"
      ? {
          transform: `scale(${screenScale.toFixed(3)})`,
          transformOrigin: `${activeZoom.originX}% ${activeZoom.originY}%`
        }
      : {
          transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
            3
          )})`,
          transformOrigin: `${activeZoom.originX}% ${activeZoom.originY}%`
        };
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
  const timelineVisible =
    activeTool === "cut" ||
    activeTool === "zoom" ||
    activeTool === "audio" ||
    activeTool === "subtitles";

  useEffect(() => {
    if (!selectedItemId && allMedia.length > 0) {
      setSelectedItemId(allMedia[0].id);
    }
  }, [allMedia, selectedItemId]);

  useEffect(() => {
    const availableItemIds = new Set(timelineEditableItems.map((item) => item.id));
    const nextKnownItemIds = new Set(
      [...knownTimelineItemIdsRef.current].filter((itemId) => availableItemIds.has(itemId))
    );
    const newItemIds = new Set(
      timelineEditableItems
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
    videoClipsRef.current = videoTimelineClips;
  }, [videoTimelineClips]);

  useEffect(() => {
    audioClipsRef.current = audioTimelineClips;
  }, [audioTimelineClips]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    audioLevelsRef.current = audioLevels;
  }, [audioLevels]);

  useEffect(() => {
    timelineDurationRef.current = timelineDuration;
  }, [timelineDuration]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

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
        syncMediaToTime(timelineDurationRef.current, false);
        setPlaying(false);
        return;
      }

      currentTimeRef.current = next;
      // Sync media every frame for tight A/V alignment, but throttle the (heavy)
      // React re-render that moves the playhead/UI to ~30fps.
      syncMediaToTime(next, true);
      if (now - lastUiUpdate >= 33) {
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
        deleteSelectedTimelineSegment();
      }
    }

    window.addEventListener("keydown", handleTimelineKeyDown);
    return () => window.removeEventListener("keydown", handleTimelineKeyDown);
  }, [
    currentTime,
    masterVolume,
    isProjectCompositionSelected,
    playing,
    selectedItem?.id,
    selectedTimelineSegmentId,
    timelineRedoStack,
    timelineSegments,
    timelineUndoStack
  ]);

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
    setTimelineSegments((current) => current.filter((segment) => segment.itemId !== itemId));
    knownTimelineItemIdsRef.current.delete(itemId);
    setSelectedItemId((current) => (current === itemId ? projectMedia[0]?.id ?? null : current));
    setSelectedTimelineSegmentId((current) => {
      const segment = timelineSegments.find((item) => item.id === current);
      return segment?.itemId === itemId ? null : current;
    });
  }

  // Slave every media element to the global timeline time `t`. The main video
  // element shows whichever video clip is under the playhead; each audio clip
  // plays when the playhead is inside it. Elements only hard-seek when they drift
  // more than ~0.3s so normal playback stays smooth.
  function effectiveClipVolume(itemId: string): number {
    const master = Math.max(0, masterVolumeRef.current / 100);
    const level = audioLevelsRef.current[itemId] ?? { volume: 100, muted: false };
    if (level.muted) {
      return 0;
    }
    return Math.min(1, master * (level.volume / 100));
  }

  function syncMediaToTime(t: number, isPlaying: boolean) {
    const master = Math.min(1, Math.max(0, masterVolumeRef.current / 100));
    const videoClip =
      videoClipsRef.current.find(
        (clip) => t >= clip.start && t < clip.start + clip.duration
      ) ?? null;

    const videoEl = mainVideoRef.current;
    if (videoEl && videoClip && videoClip.item.kind === "video") {
      const desired = videoClip.sourceStart + (t - videoClip.start);
      if (Math.abs(videoEl.currentTime - desired) > 0.3) {
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
    }

    const cameraEl = cameraRef.current;
    if (cameraEl && videoClip) {
      const desired = videoClip.sourceStart + (t - videoClip.start);
      if (Math.abs(cameraEl.currentTime - desired) > 0.3) {
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
    }

    for (const clip of audioClipsRef.current) {
      const el = audioElsRef.current.get(clip.id);
      if (!el) {
        continue;
      }

      const active = t >= clip.start && t < clip.start + clip.duration;
      if (active) {
        const desired = clip.sourceStart + (t - clip.start);
        if (Math.abs(el.currentTime - desired) > 0.3) {
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
      syncMediaToTime(currentTimeRef.current, false);
      return;
    }

    let startAt = currentTimeRef.current;
    if (startAt >= timelineDuration - 0.05) {
      startAt = 0;
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    syncMediaToTime(startAt, true);
    setPlaying(true);
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, timelineDuration || value));
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current);
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

  function seekFrame(frame: number) {
    const nextFrame = Math.max(0, Math.min(frame, totalFrames));
    seek(nextFrame / frameRate);
  }

  function getTimelineTimeFromClientX(clientX: number): number | null {
    const timelineBody = timelineBodyRef.current;
    if (!timelineBody || timelineDuration <= 0) {
      return null;
    }

    const lane = timelineBody.querySelector<HTMLElement>(".track-lane");
    const bounds = lane?.getBoundingClientRect() ?? timelineBody.getBoundingClientRect();
    if (bounds.width <= 0) {
      return null;
    }

    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    return progress * timelineDuration;
  }

  function seekTimelinePointer(clientX: number) {
    const nextTime = getTimelineTimeFromClientX(clientX);
    if (nextTime === null) {
      return;
    }

    seek(nextTime);
  }

  function commitTimelineSegments(updater: (segments: TimelineSegment[]) => TimelineSegment[]) {
    setTimelineSegments((current) => {
      const next = updater(current);
      if (areTimelineSegmentsEqual(current, next)) {
        return current;
      }

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
    setTrimmingSegmentId(segmentId);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipTrim(clientX: number) {
    const drag = timelineTrimDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    setTimelineSegments((current) =>
      trimTimelineSegment(current, drag.segmentId, drag.edge, time, mediaDurationById)
    );
  }

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
    setTrimmingSegmentId(null);
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

    const delta = time - drag.pointerStartTime;
    if (!drag.moved && Math.abs(delta) < 0.02) {
      return;
    }

    drag.moved = true;
    const rawStart = Math.max(0, drag.segmentStart + delta);
    setTimelineSegments((current) =>
      moveTimelineSegment(current, drag.segmentId, rawStart, timelineDuration)
    );
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
      const length = drag.origEnd - drag.origStart;
      const start = clampNumber(
        drag.origStart + delta,
        0,
        Math.max(0, timelineDuration - length)
      );
      updateZoomEffect(drag.id, { start, end: start + length });
      return;
    }

    if (drag.mode === "start") {
      updateZoomEffect(drag.id, { start: clampNumber(time, 0, drag.origEnd - 0.2) });
      return;
    }

    updateZoomEffect(drag.id, { end: clampNumber(time, drag.origStart + 0.2, timelineDuration) });
  }

  function finishZoomClipDrag() {
    zoomDragRef.current = null;
  }

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
    const end = activeDuration > 0 ? Math.min(activeDuration, start + 2.5) : start + 2.5;
    const nextEffect: ZoomEffect = {
      id: createId("zoom"),
      start,
      end: Math.max(start + 0.5, end),
      speed: "medium",
      scale: 1.5,
      targetX: 50,
      targetY: 50
    };
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

  function updateTrimStart(value: number) {
    setTrimRange((current) => {
      const end = current.end > 0 ? current.end : timelineDuration;
      const nextStart = clampNumber(value, 0, Math.max(0, end - 0.1));
      return {
        start: nextStart,
        end: Math.max(end, nextStart + 0.1)
      };
    });
  }

  function updateTrimEnd(value: number) {
    setTrimRange((current) => ({
      start: current.start,
      end: clampNumber(value, current.start + 0.1, timelineDuration)
    }));
  }

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

        {error ? <div className="studio-error">{error}</div> : null}
        {exportMessage ? <div className="studio-success">{exportMessage}</div> : null}

        <div className="studio-workspace">
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

          <aside className={`tool-panel ${activeTool === "layout" ? "tool-panel-layout" : ""}`}>
            <ToolPanelHeader
              icon={editorTools.find((tool) => tool.id === activeTool)?.icon}
              title={editorTools.find((tool) => tool.id === activeTool)?.label ?? "Tools"}
            />

            {activeTool === "media" ? (
              <>
                <button
                  className="import-button"
                  type="button"
                  onClick={() => void importMedia()}
                >
                  <Upload size={15} />
                  Import media
                </button>
                <div className="media-tabs">
                  {(["all", "video", "audio", "image"] as MediaPanel[]).map((panel) => (
                    <button
                      className={activePanel === panel ? "media-tab-active" : ""}
                      type="button"
                      key={panel}
                      onClick={() => setActivePanel(panel)}
                    >
                      {panel === "all" ? "All" : panel}
                    </button>
                  ))}
                </div>

                <div className="asset-grid">
                  {visibleMedia.map((item) => (
                    <AssetCard
                      key={item.id}
                      item={item}
                      selected={selectedItem?.id === item.id}
                      onSelect={() => selectTimelineItem(item.id)}
                      onDuration={(nextDuration) => updateMediaDuration(item.id, nextDuration)}
                      onRemove={
                        item.origin === "imported" ? () => removeImportedMedia(item.id) : undefined
                      }
                    />
                  ))}
                </div>

                {visibleMedia.length === 0 ? (
                  <div className="media-empty">
                    <Plus size={18} />
                    <span>Import media or finish a recording to begin editing.</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeTool === "layout" ? (
              <div className="layout-panel">
                <div className="layout-panel-title">Presets</div>

                <div className="layout-presets">
                  {layoutPresetGroups.map((group) => (
                    <section className="layout-preset-group" key={group.title}>
                      <h3>{group.title}</h3>
                      <div className="layout-preset-grid">
                        {group.presets.map((preset) => (
                          <button
                            className={`layout-preset-card layout-preset-${preset.variant} ${
                              layoutMode === preset.id ? "layout-preset-active" : ""
                            }`}
                            type="button"
                            key={`${group.title}-${preset.variant}`}
                            aria-label={preset.label}
                            onClick={() => setLayoutMode(preset.id)}
                          >
                            <span className="layout-preset-screen">
                              <i />
                              <b />
                            </span>
                            <strong>{preset.label}</strong>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="layout-customization">
                  <div className="layout-control-group">
                    <span>Camera style</span>
                    <div className="icon-segmented-control">
                      {(["circle", "rounded", "square"] as CameraShape[]).map((shape) => (
                        <button
                          className={cameraShape === shape ? "segmented-active" : ""}
                          type="button"
                          key={shape}
                          onClick={() => setCameraShape(shape)}
                          title={shape}
                        >
                          <i className={`camera-shape-icon camera-shape-${shape}`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="layout-control-group">
                    <span>Camera border</span>
                    <div className="segmented-control">
                      {(["none", "light", "accent"] as CameraBorderStyle[]).map((border) => (
                        <button
                          className={cameraBorderStyle === border ? "segmented-active" : ""}
                          type="button"
                          key={border}
                          onClick={() => setCameraBorderStyle(border)}
                        >
                          {border}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="layout-control-grid">
                    <div className="layout-control-group">
                      <span>Position</span>
                      <div className="position-grid">
                        {cameraPositionOptions.map((position) => (
                          <button
                            className={cameraPosition === position ? "position-active" : ""}
                            type="button"
                            key={position}
                            onClick={() => setCameraPosition(position)}
                            title={position.replace("-", " ")}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="layout-control-group">
                      <span>Camera size</span>
                      <div className="segmented-control">
                        {cameraSizeOptions.map((option) => (
                          <button
                            className={cameraSize === option.value ? "segmented-active" : ""}
                            type="button"
                            key={option.label}
                            onClick={() => setCameraSize(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTool === "audio" ? (
              <div className="tool-stack">
                <RangeControl
                  label="Master volume"
                  min={0}
                  max={200}
                  value={masterVolume}
                  suffix="%"
                  onChange={setMasterVolume}
                />
                <button
                  className="secondary-tool-button"
                  type="button"
                  onClick={() => void importMedia({ backgroundAudio: true, selectFirst: false })}
                >
                  <Music2 size={16} />
                  Add background music
                </button>
                <div className="audio-source-list">
                  {audioSources.map((item) => {
                    const level = audioLevels[item.id] ?? { volume: 100, muted: false };
                    return (
                      <div
                        className={`audio-source ${level.muted ? "audio-source-muted" : ""}`}
                        key={item.id}
                      >
                        <div className="audio-source-head">
                          <button
                            className="audio-source-name"
                            type="button"
                            onClick={() => selectTimelineItem(item.id)}
                          >
                            <AudioLines size={14} />
                            <span>{item.name}</span>
                          </button>
                          <output>{level.volume}%</output>
                          <button
                            className="audio-source-mute"
                            type="button"
                            title={level.muted ? "Unmute" : "Mute"}
                            onClick={() => setAudioLevel(item.id, { muted: !level.muted })}
                          >
                            {level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                          </button>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={level.volume}
                          onChange={(event) =>
                            setAudioLevel(item.id, { volume: Number(event.target.value) })
                          }
                        />
                      </div>
                    );
                  })}
                  {audioSources.length === 0 ? (
                    <div className="tool-empty">Record with a mic or add music to control audio</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTool === "zoom" ? (
              <div className="tool-stack">
                <button className="secondary-tool-button" type="button" onClick={addZoomEffect}>
                  <WandSparkles size={16} />
                  Add smooth zoom
                </button>
                <ZoomTargetPanel
                  item={previewItem}
                  selectedZoomEffect={selectedZoomEffect}
                  onScaleChange={(scale) => {
                    if (selectedZoomEffect) {
                      updateZoomEffect(selectedZoomEffect.id, { scale });
                    }
                  }}
                  onRegionChange={(region) => {
                    if (selectedZoomEffect) {
                      updateZoomEffect(selectedZoomEffect.id, region);
                    }
                  }}
                />
                {selectedZoomEffect ? (
                  <div className="layout-control-group">
                    <span>Zoom speed</span>
                    <div className="segmented-control segmented-control-3">
                      {(["slow", "medium", "fast"] as ZoomSpeed[]).map((speed) => (
                        <button
                          className={selectedZoomEffect.speed === speed ? "segmented-active" : ""}
                          type="button"
                          key={speed}
                          onClick={() => updateZoomEffect(selectedZoomEffect.id, { speed })}
                        >
                          {speed}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="tool-empty">Add a zoom, then drag its box on the timeline.</div>
                )}
              </div>
            ) : null}

            {activeTool === "subtitles" ? (
              <div className="tool-stack">
                <button className="secondary-tool-button" type="button" onClick={addSubtitle}>
                  <Captions size={16} />
                  Add subtitle
                </button>
                <button
                  className="secondary-tool-button"
                  type="button"
                  disabled={sttStatus === "loading" || sttStatus === "transcribing"}
                  onClick={() => void generateSubtitles()}
                >
                  <WandSparkles size={16} />
                  {sttStatus === "loading"
                    ? "Loading model…"
                    : sttStatus === "transcribing"
                      ? "Transcribing…"
                      : "Auto-generate (speech-to-text)"}
                </button>
                <div className="cut-hint">
                  <WandSparkles size={14} />
                  <span>
                    Runs an open-source Whisper model on your device. The first run downloads
                    the model (~40MB), then transcribes the recording's audio into subtitles.
                  </span>
                </div>
                <div className="layout-control-group">
                  <span>Subtitle style</span>
                  <div className="segmented-control">
                    {subtitleStyleOptions.map((option) => (
                      <button
                        className={subtitleStyle === option.id ? "segmented-active" : ""}
                        type="button"
                        key={option.id}
                        onClick={() => setSubtitleStyle(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedSubtitle ? (
                  <div className="subtitle-editor">
                    <textarea
                      value={selectedSubtitle.text}
                      onChange={(event) =>
                        updateSubtitle(selectedSubtitle.id, { text: event.target.value })
                      }
                    />
                    <div className="time-input-grid">
                      <label>
                        <span>Start</span>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={selectedSubtitle.start}
                          onChange={(event) =>
                            updateSubtitle(selectedSubtitle.id, {
                              start: Number(event.target.value)
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>End</span>
                        <input
                          type="number"
                          min={selectedSubtitle.start + 0.1}
                          step={0.1}
                          value={selectedSubtitle.end}
                          onChange={(event) =>
                            updateSubtitle(selectedSubtitle.id, {
                              end: Number(event.target.value)
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="tool-empty">No subtitles</div>
                )}
                <div className="tool-list">
                  {subtitles.map((subtitle) => (
                    <button
                      className={`tool-list-item ${
                        selectedSubtitle?.id === subtitle.id ? "tool-list-item-active" : ""
                      }`}
                      type="button"
                      key={subtitle.id}
                      onClick={() => setSelectedSubtitleId(subtitle.id)}
                    >
                      <Captions size={15} />
                      <span>{subtitle.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTool === "cut" ? (
              <div className="tool-stack">
                <div className="cut-hint">
                  <Scissors size={14} />
                  <span>
                    Click the timeline to move the playhead, then split. Drag a clip to move it,
                    drag its edges to trim, or delete the selected clip.
                  </span>
                </div>
                <button
                  className="secondary-tool-button"
                  type="button"
                  onClick={() => splitTimelineSegment(selectedTimelineSegmentId, currentTime)}
                >
                  <Scissors size={16} />
                  Split at playhead
                </button>
                {selectedTimelineClip ? (
                  <>
                    <div className="cut-selected">
                      <strong>{selectedTimelineClip.item.name}</strong>
                      <span>
                        {formatSeconds(selectedTimelineClip.start)} –{" "}
                        {formatSeconds(selectedTimelineClip.start + selectedTimelineClip.duration)}
                      </span>
                    </div>
                    <button
                      className="secondary-tool-button secondary-tool-danger"
                      type="button"
                      onClick={deleteSelectedTimelineSegment}
                    >
                      <Trash2 size={16} />
                      Delete selected clip
                    </button>
                  </>
                ) : (
                  <div className="tool-empty">Select a clip on the timeline to trim or delete it.</div>
                )}
              </div>
            ) : null}

            {activeTool === "style" ? (
              <div className="tool-stack">
                <div className="media-tabs">
                  {backgroundCategories.map((category) => (
                    <button
                      className={activeBackgroundCategory === category.id ? "media-tab-active" : ""}
                      type="button"
                      key={category.id}
                      onClick={() => setActiveBackgroundCategory(category.id)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="style-grid">
                  {backgroundCategories
                    .find((category) => category.id === activeBackgroundCategory)
                    ?.options.map((option) => (
                      <button
                        className={`style-swatch style-swatch-${option.id} ${
                          backgroundStyle === option.id ? "style-swatch-active" : ""
                        }`}
                        type="button"
                        key={option.id}
                        onClick={() => setBackgroundStyle(option.id)}
                      >
                        <span />
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                </div>
                <button
                  className={`secondary-tool-button ${
                    backgroundStyle === "custom" ? "tool-option-active" : ""
                  }`}
                  type="button"
                  onClick={() => void importCustomBackground()}
                >
                  <Upload size={16} />
                  Upload custom background
                </button>
                <div className="layout-control-group">
                  <span>Video corners</span>
                  <div className="segmented-control">
                    {(["flat", "soft", "round"] as VideoCornerStyle[]).map((shape) => (
                      <button
                        className={videoCornerStyle === shape ? "segmented-active" : ""}
                        type="button"
                        key={shape}
                        onClick={() => setVideoCornerStyle(shape)}
                      >
                        {shape === "flat" ? "Flat" : shape === "soft" ? "Slight" : "Full"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>

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
                    activeSubtitle={activeSubtitle}
                    subtitleStyle={subtitleStyle}
                    currentTime={currentTime}
                    mainVideoRef={mainVideoRef}
                    cameraRef={cameraRef}
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
        <section className="timeline-panel grid min-w-0 gap-[0.45rem] bg-transparent px-[1.1rem] pb-4 pt-3 [--timeline-body-pad:0.7rem] [--timeline-label-width:132px] [--timeline-track-gap:0.85rem]">
          <div className="timeline-toolbar grid grid-cols-[238px_minmax(0,1fr)_142px] items-center gap-3">
            <div className="timeline-toolset timeline-playback inline-flex h-9 min-w-0 items-center gap-1.5 bg-transparent px-1.5 text-[0.68rem] text-slate-400">
              <button type="button" onClick={() => seekFrame(currentFrame - 1)} title="Previous frame">
                <SkipBack size={14} />
              </button>
              <button type="button" onClick={() => void togglePlayback()} title="Play">
                {playing ? <CircleStop size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => seekFrame(currentFrame + 1)} title="Next frame">
                <SkipForward size={14} />
              </button>
              <span className="text-xs font-extrabold tabular-nums text-cyan-400">
                {formatTimecode(currentTime, currentFrame)}
              </span>
            </div>

            <input
              className="frame-scrubber"
              type="range"
              min={0}
              max={totalFrames}
              step={1}
              value={currentFrame}
              aria-label="Timeline scrubber"
              style={{ "--scrubber-progress": `${playheadPercent}%` } as CSSProperties}
              onChange={(event) => seekFrame(Number(event.target.value))}
            />

            <div className="timeline-status inline-flex h-9 min-w-0 items-center justify-end gap-1.5 text-[0.72rem] tabular-nums text-slate-400">
              <SlidersHorizontal size={14} />
              <span>
                {currentFrame} / {totalFrames}
              </span>
            </div>
          </div>

          <div className="timeline-ruler grid grid-cols-6 pl-[calc(var(--timeline-label-width)+var(--timeline-track-gap))] text-[0.68rem] tabular-nums text-slate-500">
            {createTimelineTicks(timelineDuration).map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <div
            className={cx(
              "timeline-body relative grid min-h-[12.3rem] cursor-pointer select-none gap-1.5 overflow-visible bg-transparent px-[var(--timeline-body-pad)] pb-3 pt-2.5 touch-none",
              scrubbingTimeline && "timeline-body-scrubbing cursor-ew-resize"
            )}
            ref={timelineBodyRef}
            style={{ "--timeline-progress": `${playheadPercent}` } as CSSProperties}
            onPointerDown={beginTimelineScrub}
            onPointerMove={moveTimelineScrub}
            onPointerUp={endTimelineScrub}
            onPointerCancel={endTimelineScrub}
            onContextMenu={openTimelineContextMenu}
          >
            <div
              className="playhead absolute bottom-1 top-0 z-[5] w-5 -translate-x-1/2 cursor-ew-resize bg-transparent"
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={0}
              aria-valuemax={Number(timelineDuration.toFixed(2))}
              aria-valuenow={Number(currentTime.toFixed(2))}
              aria-valuetext={formatSeconds(currentTime)}
              tabIndex={0}
              style={{
                left: `calc(var(--timeline-body-pad) + var(--timeline-label-width) + var(--timeline-track-gap) + (${playheadPercent} * (100% - (2 * var(--timeline-body-pad)) - var(--timeline-label-width) - var(--timeline-track-gap)) / 100))`
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  seekFrame(currentFrame - 1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  seekFrame(currentFrame + 1);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  seek(0);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  seek(timelineDuration);
                }
              }}
            >
              <span />
            </div>
            <TimelineTrack
              label="Video 1"
              accent="purple"
              icon={<Film size={14} />}
            >
              {videoTimelineClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  timelineDuration={timelineDuration}
                  selected={selectedTimelineSegmentId === clip.id}
                  selectedSegment={selectedTimelineSegmentId === clip.id}
                  onSelect={() => {
                    setSelectedItemId(clip.item.id);
                    setSelectedTimelineSegmentId(clip.id);
                  }}
                  onTrimPointerDown={beginTimelineClipTrim}
                  onMovePointerDown={beginTimelineClipMove}
                />
              ))}
            </TimelineTrack>

            {activeTool === "zoom" ? (
              <TimelineTrack label="Zoom" accent="amber" icon={<WandSparkles size={14} />}>
                {zoomEffects.map((effect) => (
                  <TimelineZoomClip
                    key={effect.id}
                    effect={effect}
                    duration={timelineDuration}
                    selected={selectedZoomEffect?.id === effect.id}
                    onSelect={() => {
                      setSelectedZoomId(effect.id);
                      setActiveTool("zoom");
                      seek((effect.start + effect.end) / 2);
                    }}
                    onDragPointerDown={beginZoomClipDrag}
                  />
                ))}
              </TimelineTrack>
            ) : null}

            {activeTool === "audio" ? (
              audioTimelineTracks.map((track) => (
                <TimelineTrack
                  key={track.lane}
                  label={`Audio ${track.lane + 1}`}
                  accent="green"
                  icon={<AudioLines size={14} />}
                >
                  {track.clips.map((clip) => (
                    <TimelineClip
                      key={clip.id}
                      clip={clip}
                      timelineDuration={timelineDuration}
                      selected={selectedTimelineSegmentId === clip.id}
                      selectedSegment={selectedTimelineSegmentId === clip.id}
                      onSelect={() => {
                        setSelectedItemId(clip.item.id);
                        setSelectedTimelineSegmentId(clip.id);
                      }}
                      onTrimPointerDown={beginTimelineClipTrim}
                      onMovePointerDown={beginTimelineClipMove}
                    />
                  ))}
                </TimelineTrack>
              ))
            ) : null}

            {activeTool === "subtitles" ? (
              <TimelineTrack label="Subtitles" accent="cyan" icon={<Captions size={14} />}>
                {subtitles.map((subtitle) => (
                  <TimelineSubtitleClip
                    key={subtitle.id}
                    subtitle={subtitle}
                    duration={timelineDuration}
                    selected={selectedSubtitle?.id === subtitle.id}
                    onSelect={() => {
                      setSelectedSubtitleId(subtitle.id);
                      setActiveTool("subtitles");
                    }}
                  />
                ))}
              </TimelineTrack>
            ) : null}
          </div>
          {timelineContextMenu ? (
            <div
              className="timeline-context-menu"
              style={{ left: timelineContextMenu.x, top: timelineContextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                disabled={!canSplitTimelineSegmentAt(timelineSegments, timelineContextMenu)}
                onClick={() =>
                  splitTimelineSegment(timelineContextMenu.segmentId, timelineContextMenu.time)
                }
              >
                <Scissors size={14} />
                Split
              </button>
              <button
                type="button"
                className="timeline-context-menu-danger"
                disabled={!timelineContextMenu.segmentId}
                onClick={() => deleteTimelineSegment(timelineContextMenu.segmentId)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          ) : null}
        </section>
        ) : null}
      </section>
    </main>
  );
}

function ToolPanelHeader(props: { icon: ReactNode; title: string }) {
  return (
    <div className="tool-panel-header">
      <span>{props.icon}</span>
      <strong>{props.title}</strong>
      <button type="button" title="Panel options">
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function ExportDialog(props: {
  exportFormat: ExportVideoFormat;
  exportResolution: ExportResolution;
  exporting: boolean;
  onClose: () => void;
  onExport: () => void;
  onFormatChange: (format: ExportVideoFormat) => void;
  onResolutionChange: (resolution: ExportResolution) => void;
}) {
  return (
    <div className="export-dialog-backdrop" role="presentation">
      <section className="export-dialog" role="dialog" aria-modal="true" aria-label="Export video">
        <div className="export-dialog-header">
          <strong>Export video</strong>
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            <X size={16} />
          </button>
        </div>
        <label>
          <span>Resolution</span>
          <select
            value={props.exportResolution}
            onChange={(event) =>
              props.onResolutionChange(event.target.value as ExportResolution)
            }
            disabled={props.exporting}
          >
            {exportResolutions.map((resolution) => (
              <option key={resolution} value={resolution}>
                {resolution === "source" ? "Source" : resolution}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Format</span>
          <select
            value={props.exportFormat}
            onChange={(event) => props.onFormatChange(event.target.value as ExportVideoFormat)}
            disabled={props.exporting}
          >
            {exportFormats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="export-dialog-actions">
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            Cancel
          </button>
          <button type="button" onClick={props.onExport} disabled={props.exporting}>
            <Download size={15} />
            {props.exporting ? "Exporting" : "Export"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RangeControl(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {props.label}
        <output>
          {props.value}
          {props.suffix}
        </output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PreviewContent(props: {
  item: EditorMediaItem;
  isProjectCompositionSelected: boolean;
  projectCamera: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  activeSubtitle: SubtitleSegment | null;
  subtitleStyle: SubtitleStyle;
  currentTime: number;
  mainVideoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  onDuration: (duration: number | null) => void;
  onSubtitleClick: (subtitleId: string) => void;
}) {
  if (props.item.kind === "image") {
    return (
      <>
        <img className="studio-screen-video" style={props.screenStyle} src={props.item.url} alt="" />
        <SubtitleOverlay
          subtitle={props.activeSubtitle}
          currentTime={props.currentTime}
          style={props.subtitleStyle}
          onClick={props.onSubtitleClick}
        />
      </>
    );
  }

  if (props.isProjectCompositionSelected) {
    const showScreen = props.layoutMode !== "camera-only" || !props.projectCamera;
    const showCamera = Boolean(props.projectCamera && props.layoutMode !== "screen-only");

    return (
      <>
        {showScreen ? (
          <video
            ref={props.mainVideoRef}
            className="studio-screen-video"
            style={props.screenStyle}
            src={props.item.url}
            playsInline
            muted
            onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          />
        ) : null}
        {showCamera && props.projectCamera ? (
          <video
            ref={props.cameraRef}
            className="studio-camera-video"
            src={props.projectCamera.url}
            playsInline
            muted
          />
        ) : null}
        <SubtitleOverlay
          subtitle={props.activeSubtitle}
          currentTime={props.currentTime}
          style={props.subtitleStyle}
          onClick={props.onSubtitleClick}
        />
      </>
    );
  }

  return (
    <>
      <video
        ref={props.mainVideoRef}
        className="studio-screen-video"
        style={props.screenStyle}
        src={props.item.url}
        playsInline
        onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
      />
      <SubtitleOverlay
        subtitle={props.activeSubtitle}
        currentTime={props.currentTime}
        style={props.subtitleStyle}
        onClick={props.onSubtitleClick}
      />
    </>
  );
}

function SubtitleOverlay(props: {
  subtitle: SubtitleSegment | null;
  currentTime: number;
  style: SubtitleStyle;
  onClick: (subtitleId: string) => void;
}) {
  if (!props.subtitle) {
    return null;
  }

  const words = props.subtitle.text.trim().split(/\s+/).filter(Boolean);
  // No word timings are available, so spread the words evenly across the
  // subtitle's [start, end] window and highlight the one under the playhead.
  const duration = Math.max(0.1, props.subtitle.end - props.subtitle.start);
  const perWord = duration / Math.max(1, words.length);
  const elapsed = props.currentTime - props.subtitle.start;
  const highlights = props.style === "karaoke" || props.style === "pop";
  const activeIndex = highlights
    ? clampNumber(Math.floor(elapsed / perWord), 0, words.length - 1)
    : -1;

  return (
    <button
      className={`subtitle-overlay subtitle-style-${props.style}`}
      type="button"
      onClick={() => props.onClick(props.subtitle?.id ?? "")}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={`subtitle-word ${index === activeIndex ? "subtitle-word-active" : ""}`}
        >
          {word}
        </span>
      ))}
    </button>
  );
}

function AssetCard(props: {
  item: EditorMediaItem;
  selected: boolean;
  onSelect: () => void;
  onDuration?: (duration: number | null) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`asset-card ${props.selected ? "asset-card-selected" : ""}`}
    >
      <button className="asset-card-main" type="button" onClick={props.onSelect}>
        <div className="asset-preview">
          {props.item.kind === "video" ? (
            <video
              src={props.item.url}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                props.onDuration?.(event.currentTarget.duration);
                // A bare <video> paints a black frame until it has decoded one;
                // nudging currentTime forces a real first-frame thumbnail.
                try {
                  event.currentTarget.currentTime = Math.min(
                    0.1,
                    (event.currentTarget.duration || 1) / 2
                  );
                } catch {
                  // seeking may not be ready yet; ignore
                }
              }}
            />
          ) : props.item.kind === "image" ? (
            <img src={props.item.url} alt="" />
          ) : (
            <AudioLines size={18} />
          )}
        </div>
        <strong>{props.item.name}</strong>
        <span>{props.item.origin === "project" ? "Recording" : props.item.kind}</span>
      </button>
      {props.onRemove ? (
        <button
          className="asset-remove-button"
          type="button"
          onClick={props.onRemove}
          title="Remove imported media"
        >
          <Trash2 size={13} />
        </button>
      ) : null}
    </div>
  );
}

function ZoomTargetPanel(props: {
  item: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  onScaleChange: (scale: number) => void;
  onRegionChange: (region: { targetX: number; targetY: number; scale: number }) => void;
}) {
  const effect = props.selectedZoomEffect;
  const draggingRef = useRef(false);

  function moveTargetTo(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const targetX = clampNumber(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const targetY = clampNumber(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    props.onRegionChange({ targetX, targetY, scale: effect.scale });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    moveTargetTo(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (draggingRef.current) {
      moveTargetTo(event);
    }
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  return (
    <div className="zoom-target-panel">
      <span>Drag the dot to set what the zoom focuses on</span>
      <button
        className="zoom-target-preview"
        type="button"
        disabled={!effect}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {props.item?.kind === "image" ? (
          <img src={props.item.url} alt="" />
        ) : props.item?.kind === "video" ? (
          <video src={props.item.url} muted playsInline />
        ) : (
          <div className="zoom-target-empty">
            <AudioLines size={24} />
          </div>
        )}
        {effect ? (
          <i
            className="zoom-target-dot"
            style={{
              left: `${effect.targetX}%`,
              top: `${effect.targetY}%`
            }}
          />
        ) : null}
      </button>
      <label className="zoom-scale-control">
        <span>Scale</span>
        <div>
          <ZoomIn size={15} />
          <input
            type="range"
            min={125}
            max={300}
            value={Math.round((effect?.scale ?? 1.5) * 100)}
            disabled={!effect}
            onChange={(event) => props.onScaleChange(Number(event.target.value) / 100)}
          />
          <output>{Math.round((effect?.scale ?? 1.5) * 100)} %</output>
        </div>
      </label>
    </div>
  );
}

function TimelineTrack(props: {
  label: string;
  accent: "purple" | "cyan" | "green" | "amber" | "rose";
  icon: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const accentClassName = {
    purple: "text-purple-300",
    cyan: "text-cyan-400",
    green: "text-emerald-400",
    amber: "text-amber-500",
    rose: "text-rose-400"
  }[props.accent];

  return (
    <div
      className={cx(
        "timeline-track grid grid-cols-[var(--timeline-label-width)_minmax(0,1fr)] items-stretch gap-[var(--timeline-track-gap)]",
        Boolean(props.controls) && "timeline-track-with-controls gap-y-2"
      )}
    >
      <div
        className={cx(
          `track-label track-${props.accent}`,
          "inline-flex min-h-[2.35rem] min-w-0 items-center gap-2 border-r border-white/[0.07] text-[0.68rem] font-extrabold text-slate-300",
          accentClassName
        )}
      >
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="track-lane relative min-h-[2.35rem] overflow-hidden rounded-lg bg-white/[0.035]">
        {props.children}
      </div>
      {props.controls ? (
        <div className="timeline-track-controls col-start-2 min-w-0">{props.controls}</div>
      ) : null}
    </div>
  );
}

function TimelineClip(props: {
  clip: TimelineMediaClip;
  timelineDuration: number;
  selected: boolean;
  selectedSegment: boolean;
  onSelect: () => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
  onMovePointerDown: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
}) {
  const item = props.clip.item;
  const className =
    item.kind === "audio"
      ? "clip clip-audio bg-[#0c8b70]"
      : item.kind === "image"
        ? "clip clip-image bg-gradient-to-r from-teal-700 to-sky-400"
        : "clip clip-main bg-gradient-to-r from-sky-500 to-violet-500";

  return (
    <button
      className={cx(
        className,
        "group absolute top-[0.22rem] z-[1] inline-flex h-[1.95rem] min-w-0 items-center gap-2 overflow-hidden rounded-[7px] border border-white/[0.08] px-2.5 text-[0.7rem] font-extrabold text-white shadow-inner",
        props.selected && "clip-selected",
        props.selectedSegment &&
          "clip-segment-selected outline outline-2 outline-offset-2 outline-white"
      )}
      type="button"
      data-segment-id={props.clip.id}
      style={createTimelineClipStyle(props.clip.start, props.clip.duration, props.timelineDuration)}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onMovePointerDown(event, props.clip.id)}
    >
      <span
        className="clip-edge clip-edge-start absolute inset-y-0 left-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:left-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, props.clip.id, "start")}
      />
      {item.kind === "audio" ? (
        <AudioWaveform id={props.clip.id} name={item.name} url={item.url} />
      ) : (
        <>
          <span className="clip-thumb h-6 w-13 flex-none rounded-md bg-slate-950/80" />
          <Film size={13} />
        </>
      )}
      <strong className="relative z-[2] ml-auto min-w-0 truncate pl-2 drop-shadow">
        {item.name}
      </strong>
      <span
        className="clip-edge clip-edge-end absolute inset-y-0 right-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:right-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, props.clip.id, "end")}
      />
    </button>
  );
}

const AudioWaveform = memo(function AudioWaveform(props: { id: string; name: string; url: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let wavesurfer: ReturnType<typeof WaveSurfer.create> | null = null;
    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (!container.isConnected) {
        return;
      }

      container.replaceChildren();
      setFailed(false);
      wavesurfer = WaveSurfer.create({
        container,
        height: 24,
        waveColor: "rgba(209, 250, 229, 0.85)",
        progressColor: "rgba(34, 211, 238, 0.95)",
        cursorWidth: 0,
        interact: false,
        normalize: true,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        hideScrollbar: true,
        autoScroll: false,
        autoCenter: false
      });

      wavesurfer.on("ready", () => setFailed(false));
      wavesurfer.on("decode", () => setFailed(false));

      void loadWaveSurferBlob(wavesurfer, props.url, props.name).catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      try {
        wavesurfer?.destroy();
      } catch {
        // ignore teardown races when the clip unmounts mid-load
      }
      container.replaceChildren();
    };
  }, [props.name, props.url]);

  return (
    <span
      className={cx(
        "waveform pointer-events-none absolute inset-x-2 inset-y-1 z-[1] flex items-center overflow-hidden bg-transparent opacity-95 [mask-image:linear-gradient(90deg,transparent_0,#000_0.55rem,#000_calc(100%_-_0.55rem),transparent_100%)]",
        failed && "waveform-fallback"
      )}
      aria-hidden="true"
      ref={containerRef}
    />
  );
});

async function loadWaveSurferBlob(
  wavesurfer: ReturnType<typeof WaveSurfer.create>,
  url: string,
  name: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Waveform audio fetch failed: ${response.status}`);
  }

  const sourceBlob = await response.blob();
  const mimeType = sourceBlob.type || inferAudioMimeType(name);
  const audioBlob = mimeType
    ? new Blob([await sourceBlob.arrayBuffer()], { type: mimeType })
    : sourceBlob;

  await wavesurfer.loadBlob(audioBlob);
}

function inferAudioMimeType(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "aac":
      return "audio/aac";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "oga":
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    default:
      return "";
  }
}

function TimelineZoomClip(props: {
  effect: ZoomEffect;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(
        "clip clip-zoom group absolute top-[0.22rem] z-[1] inline-flex h-[1.95rem] min-w-0 items-center gap-2 overflow-hidden rounded-[7px] border border-white/[0.08] bg-gradient-to-r from-amber-500 to-fuchsia-500 px-2.5 text-[0.7rem] font-extrabold text-white shadow-inner",
        props.selected && "clip-selected clip-segment-selected outline outline-2 outline-offset-2 outline-white"
      )}
      type="button"
      title={`Zoom (${props.effect.speed})`}
      style={createTimelineClipStyle(
        props.effect.start,
        props.effect.end - props.effect.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.effect.id, "move")}
    >
      <span
        className="clip-edge clip-edge-start absolute inset-y-0 left-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:left-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onDragPointerDown(event, props.effect.id, "start")}
      />
      <ZoomIn size={13} />
      <strong className="min-w-0 truncate">Zoom</strong>
      <span
        className="clip-edge clip-edge-end absolute inset-y-0 right-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:right-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onDragPointerDown(event, props.effect.id, "end")}
      />
    </button>
  );
}

function TimelineTrimClip(props: {
  duration: number;
  range: { start: number; end: number };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cx(
        "clip clip-trim absolute top-[0.22rem] z-[3] inline-flex h-[1.95rem] min-w-0 items-center gap-2 overflow-hidden rounded-[7px] border-2 border-rose-400 bg-rose-400/20 px-2.5 text-[0.7rem] font-extrabold text-white shadow-inner",
        props.selected && "clip-selected"
      )}
      type="button"
      style={createTimelineClipStyle(
        props.range.start,
        props.range.end - props.range.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      <Scissors size={13} />
      <strong className="min-w-0 truncate">
        {formatSeconds(props.range.start)} - {formatSeconds(props.range.end)}
      </strong>
    </button>
  );
}

function TimelineSubtitleClip(props: {
  subtitle: SubtitleSegment;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cx(
        "clip clip-text absolute top-[0.22rem] z-[1] inline-flex h-[1.95rem] min-w-0 items-center gap-2 overflow-hidden rounded-[7px] border border-white/[0.08] bg-cyan-600 px-2.5 text-[0.7rem] font-extrabold text-white shadow-inner",
        props.selected && "clip-selected"
      )}
      type="button"
      style={createTimelineClipStyle(
        props.subtitle.start,
        props.subtitle.end - props.subtitle.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      <Captions size={13} />
      <strong className="min-w-0 truncate">{props.subtitle.text}</strong>
    </button>
  );
}

function getTimelineMediaDuration(
  item: EditorMediaItem,
  activeDuration: number,
  selectedItemId: string | null
): number {
  if (item.duration && item.duration > 0) {
    return item.duration;
  }

  if (item.origin === "project" && item.id === selectedItemId && activeDuration > 0) {
    return activeDuration;
  }

  if (item.kind === "image") {
    return 5;
  }

  return 1;
}

function getTimelineTrackKind(item: EditorMediaItem): TimelineTrackKind {
  return item.kind === "audio" ? "audio" : "video";
}

function syncTimelineSegments(
  currentSegments: TimelineSegment[],
  items: EditorMediaItem[],
  mediaDurationById: Map<string, number>,
  newItemIds: ReadonlySet<string>
): TimelineSegment[] {
  const itemIds = new Set(items.map((item) => item.id));
  const nextSegments = currentSegments
    .filter((segment) => itemIds.has(segment.itemId))
    .map((segment) => {
      const itemDuration = mediaDurationById.get(segment.itemId) ?? 1;
      const track = segment.track;
      const lane = track === "audio" ? normalizeTimelineLane(segment.lane) : 0;
      const sourceStart = clampNumber(segment.sourceStart, 0, Math.max(0, itemDuration - 0.1));
      // A clip's timeline length can never exceed the media left after sourceStart,
      // but its end lives in timeline space and may sit well past itemDuration once
      // the clip has been moved, so clamp against start + remaining source, not
      // against the raw media duration.
      const maxEnd = segment.start + Math.max(0.1, itemDuration - sourceStart);
      const wasPlaceholderFullClip =
        segment.sourceStart === 0 &&
        segment.end - segment.start <= 1.05 &&
        itemDuration > 1.05;
      const end = wasPlaceholderFullClip
        ? maxEnd
        : clampNumber(segment.end, segment.start + 0.1, maxEnd);

      return {
        ...segment,
        track,
        lane,
        end,
        sourceStart
      };
    });

  for (const item of items) {
    if (!newItemIds.has(item.id) || nextSegments.some((segment) => segment.itemId === item.id)) {
      continue;
    }

    const track = getTimelineTrackKind(item);
    // Video clips stay sequenced on the video track. Audio clips start at the
    // beginning and are assigned to the first channel that keeps them visible
    // without overlapping another clip on that channel.
    const trackEnd = nextSegments
      .filter((segment) => segment.track === track)
      .reduce((max, segment) => Math.max(max, segment.end), 0);
    const itemDuration = mediaDurationById.get(item.id) ?? 1;
    const segmentId = `${item.id}:segment-0`;
    const start = track === "audio" ? 0 : trackEnd;
    const end = start + itemDuration;
    const lane =
      track === "audio" ? resolveAudioLane(nextSegments, segmentId, start, end, 0) : 0;

    nextSegments.push({
      id: segmentId,
      itemId: item.id,
      track,
      lane,
      start,
      end,
      sourceStart: 0
    });
  }

  const normalizedSegments = normalizeAudioLanes(nextSegments);
  return areTimelineSegmentsEqual(currentSegments, normalizedSegments)
    ? currentSegments
    : normalizedSegments;
}

function createTimelineMediaClips(
  segments: TimelineSegment[],
  mediaById: Map<string, EditorMediaItem>
): TimelineMediaClip[] {
  return segments
    .map((segment) => {
      const item = mediaById.get(segment.itemId);
      if (!item) {
        return null;
      }

      return {
        id: segment.id,
        item,
        track: segment.track,
        lane: segment.track === "audio" ? normalizeTimelineLane(segment.lane) : 0,
        start: segment.start,
        duration: Math.max(0.1, segment.end - segment.start),
        sourceStart: segment.sourceStart
      } satisfies TimelineMediaClip;
    })
    .filter((clip): clip is TimelineMediaClip => Boolean(clip))
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id));
}

function findTimelineSegmentAtTime(
  segments: TimelineSegment[],
  time: number
): TimelineSegment | null {
  return (
    segments.find((segment) => time > segment.start && time < segment.end) ??
    segments.find((segment) => time >= segment.start && time <= segment.end) ??
    null
  );
}

function canSplitTimelineSegment(segment: TimelineSegment, time: number): boolean {
  return time > segment.start + 0.1 && time < segment.end - 0.1;
}

function canSplitTimelineSegmentAt(
  segments: TimelineSegment[],
  contextMenu: Exclude<TimelineContextMenu, null>
): boolean {
  const segment =
    (contextMenu.segmentId
      ? segments.find((item) => item.id === contextMenu.segmentId)
      : null) ?? findTimelineSegmentAtTime(segments, contextMenu.time);
  return segment ? canSplitTimelineSegment(segment, contextMenu.time) : false;
}

function trimTimelineSegment(
  segments: TimelineSegment[],
  segmentId: string,
  edge: TimelineTrimEdge,
  time: number,
  mediaDurationById: Map<string, number>
): TimelineSegment[] {
  const nextSegments = segments.map((segment) => {
    if (segment.id !== segmentId) {
      return segment;
    }

    const mediaDuration = mediaDurationById.get(segment.itemId) ?? segment.end;
    const minDuration = 0.15;

    if (edge === "start") {
      const nextStart = clampNumber(time, 0, segment.end - minDuration);
      const sourceStart = clampNumber(
        segment.sourceStart + (nextStart - segment.start),
        0,
        Math.max(0, mediaDuration - minDuration)
      );
      return {
        ...segment,
        start: nextStart,
        sourceStart
      };
    }

    const maxEnd = segment.start + Math.max(minDuration, mediaDuration - segment.sourceStart);
    return {
      ...segment,
      end: clampNumber(time, segment.start + minDuration, maxEnd)
    };
  });

  return resolveSegmentAudioLane(nextSegments, segmentId);
}

function moveTimelineSegment(
  segments: TimelineSegment[],
  segmentId: string,
  rawStart: number,
  timelineDuration: number
): TimelineSegment[] {
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment) {
    return segments;
  }

  const length = segment.end - segment.start;
  const snapThreshold = Math.max(0.08, timelineDuration * 0.01);
  const snapTargets = [0];
  for (const other of segments) {
    if (other.id === segmentId || other.track !== segment.track) {
      continue;
    }
    snapTargets.push(other.start, other.end);
  }

  let start = Math.max(0, rawStart);
  for (const target of snapTargets) {
    if (Math.abs(start - target) <= snapThreshold) {
      start = target;
      break;
    }
  }
  const end = start + length;
  for (const target of snapTargets) {
    if (Math.abs(end - target) <= snapThreshold) {
      start = Math.max(0, target - length);
      break;
    }
  }

  const nextStart = Math.max(0, start);
  const nextEnd = nextStart + length;
  const nextLane =
    segment.track === "audio"
      ? resolveAudioLane(segments, segmentId, nextStart, nextEnd, segment.lane)
      : segment.lane;

  return segments.map((item) =>
    item.id === segmentId
      ? { ...item, lane: item.track === "audio" ? nextLane : 0, start: nextStart, end: nextEnd }
      : item
  );
}

function createAudioTimelineTracks(
  clips: TimelineMediaClip[]
): Array<{ lane: number; clips: TimelineMediaClip[] }> {
  const lanes = new Map<number, TimelineMediaClip[]>();

  for (const clip of clips) {
    const lane = normalizeTimelineLane(clip.lane);
    lanes.set(lane, [...(lanes.get(lane) ?? []), clip]);
  }

  return [...lanes.entries()]
    .sort(([firstLane], [secondLane]) => firstLane - secondLane)
    .map(([lane, laneClips]) => ({
      lane,
      clips: laneClips.sort(
        (first, second) => first.start - second.start || first.id.localeCompare(second.id)
      )
    }));
}

function normalizeAudioLanes(segments: TimelineSegment[]): TimelineSegment[] {
  const normalized = segments.map((segment) => ({
    ...segment,
    lane: segment.track === "audio" ? normalizeTimelineLane(segment.lane) : 0
  }));
  const processedAudioSegments: TimelineSegment[] = [];
  const laneById = new Map<string, number>();

  for (const segment of normalized
    .filter((item) => item.track === "audio")
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id))) {
    let lane = normalizeTimelineLane(segment.lane);
    while (audioLaneHasOverlap(processedAudioSegments, segment.id, lane, segment.start, segment.end)) {
      lane += 1;
    }

    laneById.set(segment.id, lane);
    processedAudioSegments.push({ ...segment, lane });
  }

  return normalized.map((segment) =>
    segment.track === "audio" ? { ...segment, lane: laneById.get(segment.id) ?? 0 } : segment
  );
}

function resolveSegmentAudioLane(
  segments: TimelineSegment[],
  segmentId: string
): TimelineSegment[] {
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment || segment.track !== "audio") {
    return segments;
  }

  const lane = resolveAudioLane(segments, segmentId, segment.start, segment.end, segment.lane);
  return segments.map((item) => (item.id === segmentId ? { ...item, lane } : item));
}

function resolveAudioLane(
  segments: TimelineSegment[],
  segmentId: string,
  start: number,
  end: number,
  preferredLane: number
): number {
  const maxLane = segments.reduce(
    (max, segment) =>
      segment.track === "audio" ? Math.max(max, normalizeTimelineLane(segment.lane)) : max,
    0
  );
  const candidates = [
    normalizeTimelineLane(preferredLane),
    ...Array.from({ length: maxLane + 2 }, (_value, index) => index)
  ];

  for (const lane of [...new Set(candidates)]) {
    if (!audioLaneHasOverlap(segments, segmentId, lane, start, end)) {
      return lane;
    }
  }

  return maxLane + 1;
}

function audioLaneHasOverlap(
  segments: TimelineSegment[],
  segmentId: string,
  lane: number,
  start: number,
  end: number
): boolean {
  return segments.some(
    (segment) =>
      segment.id !== segmentId &&
      segment.track === "audio" &&
      normalizeTimelineLane(segment.lane) === lane &&
      rangesOverlap(start, end, segment.start, segment.end)
  );
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  const tolerance = 0.01;
  return firstStart < secondEnd - tolerance && firstEnd > secondStart + tolerance;
}

function normalizeTimelineLane(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function areTimelineSegmentsEqual(first: TimelineSegment[], second: TimelineSegment[]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function createTimelineClipStyle(
  start: number,
  duration: number,
  timelineDuration: number
): CSSProperties {
  const safeDuration = Math.max(timelineDuration, start + duration, 1);
  const left = Math.min(100, Math.max(0, (start / safeDuration) * 100));
  const width = Math.min(100 - left, Math.max(1.5, (duration / safeDuration) * 100));

  return {
    left: `${left}%`,
    right: "auto",
    width: `${width}%`
  };
}

let idCounter = 0;

function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// Decode any audio/video URL to a mono 16kHz Float32Array, which is what the
// Whisper speech-to-text model expects.
async function decodeAudioTo16kMono(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const length = decoded.length;
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / channels;
      }
    }

    const targetRate = 16000;
    if (decoded.sampleRate === targetRate) {
      return mono;
    }

    const offline = new OfflineAudioContext(
      1,
      Math.ceil((length * targetRate) / decoded.sampleRate),
      targetRate
    );
    const buffer = offline.createBuffer(1, length, decoded.sampleRate);
    buffer.copyToChannel(mono, 0);
    const bufferSource = offline.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.connect(offline.destination);
    bufferSource.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void audioContext.close();
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), Math.max(min, max));
}

function createProjectMedia(project: ProjectView | null): EditorMediaItem[] {
  if (!project) {
    return [];
  }

  const items: EditorMediaItem[] = [];
  const duration = (project.durationMs ?? 0) / 1000 || null;

  if (project.mediaUrls.screen) {
    items.push({
      id: `${project.id}:screen`,
      name: "screen.webm",
      url: project.mediaUrls.screen,
      kind: "video",
      origin: "project",
      track: "screen",
      duration
    });
  }

  if (project.mediaUrls.camera) {
    items.push({
      id: `${project.id}:camera`,
      name: "camera.webm",
      url: project.mediaUrls.camera,
      kind: "video",
      origin: "project",
      track: "camera",
      duration
    });
  }

  const audioUrl = project.mediaUrls.micWav ?? project.mediaUrls.micWebm;
  if (audioUrl) {
    items.push({
      id: `${project.id}:audio`,
      name: project.mediaUrls.micWav ? "mic.wav" : "mic.webm",
      url: audioUrl,
      kind: "audio",
      origin: "project",
      track: "audio",
      duration
    });
  }

  return items;
}

function toEditorMediaItem(file: ImportedMediaFile): EditorMediaItem {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    kind: file.kind,
    origin: "imported",
    track: "imported",
    duration: null,
    importId: file.id
  };
}

function getActiveZoom(effects: ZoomEffect[], time: number): {
  scale: number;
  originX: number;
  originY: number;
} {
  const effect = effects.find((item) => time >= item.start && time <= item.end);

  if (!effect) {
    return { scale: 1, originX: 50, originY: 50 };
  }

  const duration = Math.max(0.1, effect.end - effect.start);
  const elapsed = clampNumber(time - effect.start, 0, duration);
  // Ease in, hold at full zoom, then ease out. The ramp length is set by the
  // per-zoom speed (slow ramps in gently, fast snaps in), capped at half the
  // clip so short zooms still reach full scale.
  const rampBySpeed: Record<ZoomSpeed, number> = { slow: 1, medium: 0.55, fast: 0.25 };
  const ramp = Math.min(rampBySpeed[effect.speed] ?? 0.55, duration / 2);
  const rampProgress =
    elapsed < ramp
      ? elapsed / ramp
      : elapsed > duration - ramp
        ? (duration - elapsed) / ramp
        : 1;
  const easedProgress = rampProgress * rampProgress * (3 - 2 * rampProgress);

  return {
    scale: 1 + (effect.scale - 1) * easedProgress,
    originX: effect.targetX,
    originY: effect.targetY
  };
}

function createTimelineTicks(duration: number): string[] {
  const safeDuration = Math.max(duration, 1);
  const tickCount = 6;

  return Array.from({ length: tickCount }, (_value, index) =>
    formatTimelineTick((safeDuration / (tickCount - 1)) * index, safeDuration)
  );
}

function formatTimelineTick(seconds: number, duration: number): string {
  if (duration < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  return formatSeconds(seconds);
}

function formatTimecode(seconds: number, frame: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00:00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  const remainingFrames = Math.max(0, frame % frameRate);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}:${String(remainingFrames).padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
