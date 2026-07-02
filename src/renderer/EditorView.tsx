import {
  AudioLines,
  Captions,
  CircleStop,
  Combine,
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
  Scissors,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type MediaPanel = "all" | "video" | "audio" | "image";
type EditorTool = "media" | "layout" | "audio" | "zoom" | "subtitles" | "cut" | "style";
type LayoutMode = "fill" | "fit" | "bubble" | "portrait" | "split";
type BackgroundStyle =
  | "real-world-1"
  | "real-world-2"
  | "real-world-3"
  | "gradient-1"
  | "gradient-2"
  | "gradient-3";
type ZoomDirection = "in" | "out";
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
  start: number;
  duration: number;
  sourceStart: number;
};

type TimelineSegment = {
  id: string;
  itemId: string;
  track: TimelineTrackKind;
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

type ZoomEffect = {
  id: string;
  start: number;
  end: number;
  direction: ZoomDirection;
  intensity: number;
};

type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

const frameRate = 30;

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
    title: "Side-by-Side",
    presets: [
      { id: "split", label: "Side-by-side compact", variant: "split-a" },
      { id: "portrait", label: "Side-by-side presenter", variant: "split-b" }
    ]
  },
  {
    title: "TV Presenter",
    presets: [
      { id: "portrait", label: "TV presenter focus", variant: "presenter-a", featured: true },
      { id: "fit", label: "TV presenter wide", variant: "presenter-b" }
    ]
  },
  {
    title: "Camera Bubble",
    presets: [
      { id: "bubble", label: "Camera bubble overlay", variant: "bubble-a" },
      { id: "fill", label: "Camera bubble minimal", variant: "bubble-b" }
    ]
  }
];

const backgroundOptions: Array<{
  id: BackgroundStyle;
  label: string;
}> = [
  { id: "real-world-1", label: "Real World 1" },
  { id: "real-world-2", label: "Real World 2" },
  { id: "real-world-3", label: "Real World 3" },
  { id: "gradient-1", label: "Gradient 1" },
  { id: "gradient-2", label: "Gradient 2" },
  { id: "gradient-3", label: "Gradient 3" }
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("fit");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("real-world-1");
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 88
  });
  const [cameraSize, setCameraSize] = useState(24);
  const [audioVolume, setAudioVolume] = useState(100);
  const [backgroundAudioIds, setBackgroundAudioIds] = useState<string[]>([]);
  const [zoomDirection, setZoomDirection] = useState<ZoomDirection>("in");
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedTimelineSegmentId, setSelectedTimelineSegmentId] = useState<string | null>(null);
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenu>(null);
  const [timelineUndoStack, setTimelineUndoStack] = useState<TimelineSegment[][]>([]);
  const [timelineRedoStack, setTimelineRedoStack] = useState<TimelineSegment[][]>([]);
  const [audioWaveforms, setAudioWaveforms] = useState<Record<string, number[]>>({});
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

  const screenRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const projectAudioRef = useRef<HTMLAudioElement | null>(null);
  const importedVideoRef = useRef<HTMLVideoElement | null>(null);
  const importedAudioRef = useRef<HTMLAudioElement | null>(null);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
  const timelineDragRef = useRef(false);
  const timelineTrimDragRef = useRef<TimelineTrimDrag | null>(null);
  const previousTimelineDurationRef = useRef(0);
  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());
  const loadingAudioWaveformsRef = useRef<Set<string>>(new Set());

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
  const projectAudio = projectMedia.find((item) => item.track === "audio") ?? null;
  const isProjectCompositionSelected = Boolean(
    projectScreen && selectedItem?.origin === "project"
  );
  const previewItem = isProjectCompositionSelected ? projectScreen : selectedItem;
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
  const timelineDuration = Math.max(
    activeDuration,
    ...videoTimelineClips.map((clip) => clip.start + clip.duration),
    ...audioTimelineClips.map((clip) => clip.start + clip.duration),
    ...zoomEffects.map((effect) => effect.end),
    ...subtitles.map((subtitle) => subtitle.end),
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
    zoomEffects.find((effect) => effect.id === selectedZoomId) ?? zoomEffects[0] ?? null;
  const backgroundAudioItems = importedMedia.filter((item) =>
    backgroundAudioIds.includes(item.id)
  );
  const screenScale =
    layoutMode === "fill" || layoutMode === "split"
      ? activeZoom.scale
      : (screenPosition.scale / 100) * activeZoom.scale;
  const screenStyle: CSSProperties =
    layoutMode === "fill"
      ? {
          transform: `scale(${screenScale.toFixed(3)})`
        }
      : {
          transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
            3
          )})`
        };
  const previewFrameStyle = {
    "--camera-size": `${cameraSize}%`
  } as CSSProperties;
  const previewClassName = [
    "preview-composition-frame",
    `preview-layout-${layoutMode}`,
    layoutMode === "fill" ? "preview-style-none" : `preview-style-${backgroundStyle}`
  ].join(" ");

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
    setCurrentTime(0);
    setDuration(selectedItem?.duration ?? 0);
    setPlaying(false);
  }, [selectedItem?.id, selectedItem?.duration]);

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
    const nextVolume = Math.min(1, Math.max(0, audioVolume / 100));

    for (const element of compactMediaElements([
      screenRef.current,
      cameraRef.current,
      projectAudioRef.current,
      importedVideoRef.current,
      importedAudioRef.current
    ])) {
      element.volume = nextVolume;
    }
  }, [audioVolume, selectedItem?.id]);

  useEffect(() => {
    let cancelled = false;
    const audioItems = timelineEditableItems.filter((item) => item.kind === "audio");

    for (const item of audioItems) {
      if (audioWaveforms[item.id] || loadingAudioWaveformsRef.current.has(item.id)) {
        continue;
      }

      loadingAudioWaveformsRef.current.add(item.id);
      void decodeAudioWaveform(item.url)
        .catch(() => createFallbackWaveform(item.name))
        .then((waveform) => {
          if (cancelled) {
            return;
          }

          setAudioWaveforms((current) => ({ ...current, [item.id]: waveform }));
        })
        .finally(() => {
          loadingAudioWaveformsRef.current.delete(item.id);
        });
    }

    setAudioWaveforms((current) => {
      const audioIds = new Set(audioItems.map((item) => item.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([itemId]) => audioIds.has(itemId))
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });

    return () => {
      cancelled = true;
    };
  }, [audioWaveforms, timelineEditableItems]);

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
    audioVolume,
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

  function removeImportedMedia(itemId: string) {
    void window.openVideoCraft.editor.removeImportedMedia(itemId);
    setImportedMedia((current) => current.filter((item) => item.id !== itemId));
    setBackgroundAudioIds((current) => current.filter((id) => id !== itemId));
    setTimelineSegments((current) => current.filter((segment) => segment.itemId !== itemId));
    setAudioWaveforms((current) => {
      const { [itemId]: _removed, ...next } = current;
      return next;
    });
    knownTimelineItemIdsRef.current.delete(itemId);
    setSelectedItemId((current) => (current === itemId ? projectMedia[0]?.id ?? null : current));
    setSelectedTimelineSegmentId((current) => {
      const segment = timelineSegments.find((item) => item.id === current);
      return segment?.itemId === itemId ? null : current;
    });
  }

  function mediaElements(): HTMLMediaElement[] {
    if (!selectedItem) {
      return [];
    }

    if (isProjectCompositionSelected) {
      return compactMediaElements([
        screenRef.current,
        cameraRef.current,
        projectAudioRef.current
      ]);
    }

    if (selectedItem.kind === "audio") {
      return compactMediaElements([importedAudioRef.current]);
    }

    if (selectedItem.kind === "video") {
      return compactMediaElements([importedVideoRef.current]);
    }

    return [];
  }

  async function togglePlayback() {
    const elements = mediaElements();

    if (playing) {
      elements.forEach((element) => element.pause());
      setPlaying(false);
      return;
    }

    if (elements.length === 0) {
      return;
    }

    elements.forEach((element) => {
      element.currentTime = currentTime;
      element.volume = Math.min(1, Math.max(0, audioVolume / 100));
    });
    await Promise.all(elements.map((element) => element.play()));
    setPlaying(true);
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, timelineDuration || value));
    setCurrentTime(nextTime);
    mediaElements().forEach((element) => {
      element.currentTime = nextTime;
    });
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

  function deleteSelectedTimelineSegment() {
    if (!selectedTimelineSegmentId) {
      return;
    }

    commitTimelineSegments((segments) =>
      segments.filter((segment) => segment.id !== selectedTimelineSegmentId)
    );
    setSelectedTimelineSegmentId(null);
    setTimelineContextMenu(null);
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

  function beginTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (timelineTrimDragRef.current) {
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
      id: `zoom-${Date.now()}`,
      start,
      end: Math.max(start + 0.5, end),
      direction: zoomDirection,
      intensity: 0.28
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
      id: `subtitle-${Date.now()}`,
      start,
      end: Math.max(start + 0.5, end),
      text: "New subtitle"
    };
    setSubtitles((current) => [...current, nextSubtitle]);
    setSelectedSubtitleId(nextSubtitle.id);
    setActiveTool("subtitles");
  }

  function updateSubtitle(id: string, updates: Partial<SubtitleSegment>) {
    setSubtitles((current) =>
      current.map((subtitle) => (subtitle.id === id ? { ...subtitle, ...updates } : subtitle))
    );
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
        volume: audioVolume / 100,
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
      <section className="studio-shell">
        <header className="studio-topbar">
          <div className="studio-brand">
            <div className="studio-brand-mark">
              <span />
              <span />
              <span />
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
            <button className="studio-icon-button" type="button" title="Settings">
              <Settings2 size={17} />
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
                      onSelect={() => setSelectedItemId(item.id)}
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
                <div className="layout-tabs" role="tablist" aria-label="Layout presets">
                  <button type="button" role="tab">
                    Favorites
                  </button>
                  <button className="layout-tab-active" type="button" role="tab">
                    Presets
                  </button>
                </div>

                <div className="layout-presets">
                  <strong>Presets</strong>
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
                              {preset.featured ? <em /> : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

              </div>
            ) : null}

            {activeTool === "audio" ? (
              <div className="tool-stack">
                <RangeControl
                  label="Clip volume"
                  min={0}
                  max={200}
                  value={audioVolume}
                  suffix="%"
                  onChange={setAudioVolume}
                />
                <button
                  className="secondary-tool-button"
                  type="button"
                  onClick={() => void importMedia({ backgroundAudio: true, selectFirst: false })}
                >
                  <Music2 size={16} />
                  Add background music
                </button>
                <div className="tool-list">
                  {backgroundAudioItems.map((item) => (
                    <button
                      className="tool-list-item"
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <AudioLines size={15} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                  {backgroundAudioItems.length === 0 ? (
                    <div className="tool-empty">No background audio</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTool === "zoom" ? (
              <div className="tool-stack">
                <div className="segmented-control">
                  <button
                    className={zoomDirection === "in" ? "segmented-active" : ""}
                    type="button"
                    onClick={() => setZoomDirection("in")}
                  >
                    <ZoomIn size={15} />
                    In
                  </button>
                  <button
                    className={zoomDirection === "out" ? "segmented-active" : ""}
                    type="button"
                    onClick={() => setZoomDirection("out")}
                  >
                    <ZoomOut size={15} />
                    Out
                  </button>
                </div>
                <button className="secondary-tool-button" type="button" onClick={addZoomEffect}>
                  <WandSparkles size={16} />
                  Add smooth zoom
                </button>
                <div className="trim-summary">
                  <WandSparkles size={16} />
                  <span>{zoomEffects.length} timeline zooms</span>
                </div>
              </div>
            ) : null}

            {activeTool === "subtitles" ? (
              <div className="tool-stack">
                <button className="secondary-tool-button" type="button" onClick={addSubtitle}>
                  <Captions size={16} />
                  Add subtitle
                </button>
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
                <div className="trim-summary">
                  <Scissors size={16} />
                  <span>
                    {formatSeconds(trimRange.start)} - {formatSeconds(trimRange.end)}
                  </span>
                </div>
              </div>
            ) : null}

            {activeTool === "style" ? (
              <div className="tool-stack">
                <div className="style-grid">
                  {backgroundOptions.map((option) => (
                    <button
                      className={`style-swatch style-swatch-${option.id} ${
                        backgroundStyle === option.id ? "style-swatch-active" : ""
                      }`}
                      type="button"
                      key={option.id}
                      disabled={layoutMode === "fill"}
                      onClick={() => setBackgroundStyle(option.id)}
                    >
                      <span />
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>
                {layoutMode === "fill" ? (
                  <div className="tool-empty">Fill layout has no background style.</div>
                ) : null}
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
                    projectAudio={projectAudio}
                    layoutMode={layoutMode}
                    screenStyle={screenStyle}
                    activeSubtitle={activeSubtitle}
                    screenRef={screenRef}
                    cameraRef={cameraRef}
                    projectAudioRef={projectAudioRef}
                    importedVideoRef={importedVideoRef}
                    importedAudioRef={importedAudioRef}
                    onDuration={(nextDuration) => {
                      updateDuration(nextDuration);
                      updateMediaDuration(previewItem.id, nextDuration);
                    }}
                    onTimeUpdate={setCurrentTime}
                    onEnded={() => setPlaying(false)}
                    onSubtitleClick={(subtitleId) => {
                      setSelectedSubtitleId(subtitleId);
                      setActiveTool("subtitles");
                    }}
                  />
                ) : (
                  <div className="studio-video-empty">Import media or record a screen.</div>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="timeline-panel">
          <div className="timeline-toolbar">
            <div className="timeline-toolset timeline-playback">
              <button type="button" onClick={() => seekFrame(currentFrame - 1)} title="Previous frame">
                <SkipBack size={14} />
              </button>
              <button type="button" onClick={() => void togglePlayback()} title="Play">
                {playing ? <CircleStop size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => seekFrame(currentFrame + 1)} title="Next frame">
                <SkipForward size={14} />
              </button>
              <span>{formatTimecode(currentTime, currentFrame)}</span>
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

            <div className="timeline-status">
              <SlidersHorizontal size={14} />
              <span>
                {currentFrame} / {totalFrames}
              </span>
            </div>
          </div>

          <TimelineEditStrip
            activeTool={activeTool}
            activeDuration={timelineDuration}
            selectedZoomEffect={selectedZoomEffect}
            onRemoveZoom={removeZoomEffect}
            onZoomChange={updateZoomEffect}
          />

          <div className="timeline-ruler">
            {createTimelineTicks(timelineDuration).map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <div
            className={`timeline-body ${scrubbingTimeline ? "timeline-body-scrubbing" : ""}`}
            ref={timelineBodyRef}
            style={{ "--timeline-progress": `${playheadPercent}` } as CSSProperties}
            onPointerDown={beginTimelineScrub}
            onPointerMove={moveTimelineScrub}
            onPointerUp={endTimelineScrub}
            onPointerCancel={endTimelineScrub}
            onContextMenu={openTimelineContextMenu}
          >
            <div
              className="playhead"
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={0}
              aria-valuemax={Number(timelineDuration.toFixed(2))}
              aria-valuenow={Number(currentTime.toFixed(2))}
              aria-valuetext={formatSeconds(currentTime)}
              tabIndex={0}
              style={{
                left: `calc(var(--timeline-label-width) + var(--timeline-track-gap) + (${playheadPercent} * (100% - var(--timeline-label-width) - var(--timeline-track-gap)) / 100))`
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
              controls={
                activeTool === "cut" ? (
                  <TimelineVideoCutControls
                    duration={timelineDuration}
                    range={trimRange}
                    onAddMergeClip={() => void importMedia({ selectFirst: false })}
                    onTrimEndChange={updateTrimEnd}
                    onTrimStartChange={updateTrimStart}
                  />
                ) : null
              }
            >
              {videoTimelineClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  timelineDuration={timelineDuration}
                  selected={selectedItem?.id === clip.item.id}
                  selectedSegment={selectedTimelineSegmentId === clip.id}
                  waveform={clip.item.kind === "audio" ? audioWaveforms[clip.item.id] : undefined}
                  onSelect={() => {
                    setSelectedItemId(clip.item.id);
                    setSelectedTimelineSegmentId(clip.id);
                  }}
                  onTrimPointerDown={beginTimelineClipTrim}
                />
              ))}
              {activeTool === "cut" ? (
                <TimelineTrimClip
                  duration={timelineDuration}
                  range={trimRange}
                  selected
                  onSelect={() => setActiveTool("cut")}
                />
              ) : null}
            </TimelineTrack>

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
                  }}
                />
              ))}
            </TimelineTrack>

            <TimelineTrack label="Audio 1" accent="green" icon={<AudioLines size={14} />}>
              {audioTimelineClips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  timelineDuration={timelineDuration}
                  selected={selectedItem?.id === clip.item.id}
                  selectedSegment={selectedTimelineSegmentId === clip.id}
                  waveform={clip.item.kind === "audio" ? audioWaveforms[clip.item.id] : undefined}
                  onSelect={() => {
                    setSelectedItemId(clip.item.id);
                    setSelectedTimelineSegmentId(clip.id);
                  }}
                  onTrimPointerDown={beginTimelineClipTrim}
                />
              ))}
            </TimelineTrack>

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
            </div>
          ) : null}
        </section>
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
  projectAudio: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  activeSubtitle: SubtitleSegment | null;
  screenRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  projectAudioRef: RefObject<HTMLAudioElement | null>;
  importedVideoRef: RefObject<HTMLVideoElement | null>;
  importedAudioRef: RefObject<HTMLAudioElement | null>;
  onDuration: (duration: number | null) => void;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
  onSubtitleClick: (subtitleId: string) => void;
}) {
  if (props.item.kind === "image") {
    return (
      <>
        <img className="studio-screen-video" style={props.screenStyle} src={props.item.url} alt="" />
        <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
      </>
    );
  }

  if (props.item.kind === "audio") {
    return (
      <div className="audio-preview">
        <AudioLines size={44} />
        <strong>{props.item.name}</strong>
        <audio
          ref={props.importedAudioRef}
          src={props.item.url}
          onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
          onEnded={props.onEnded}
        />
      </div>
    );
  }

  if (props.isProjectCompositionSelected) {
    return (
      <>
        <video
          ref={props.screenRef}
          className="studio-screen-video"
          style={props.screenStyle}
          src={props.item.url}
          playsInline
          onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
          onEnded={props.onEnded}
        />
        {props.projectCamera && props.layoutMode !== "fit" && props.layoutMode !== "fill" ? (
          <video
            ref={props.cameraRef}
            className="studio-camera-video"
            src={props.projectCamera.url}
            playsInline
          />
        ) : null}
        {props.projectAudio ? (
          <audio ref={props.projectAudioRef} src={props.projectAudio.url} />
        ) : null}
        <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
      </>
    );
  }

  return (
    <>
      <video
        ref={props.importedVideoRef}
        className="studio-screen-video"
        style={props.screenStyle}
        src={props.item.url}
        playsInline
        onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
        onEnded={props.onEnded}
      />
      <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
    </>
  );
}

function SubtitleOverlay(props: {
  subtitle: SubtitleSegment | null;
  onClick: (subtitleId: string) => void;
}) {
  if (!props.subtitle) {
    return null;
  }

  const words = props.subtitle.text.trim().split(/\s+/);
  const highlightedWord = words.length > 1 ? words.pop() : null;
  const leadingText = highlightedWord ? words.join(" ") : props.subtitle.text;

  return (
    <button
      className="subtitle-overlay"
      type="button"
      onClick={() => props.onClick(props.subtitle?.id ?? "")}
    >
      {leadingText}
      {highlightedWord ? <span>{highlightedWord}</span> : null}
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
              onLoadedMetadata={(event) => props.onDuration?.(event.currentTarget.duration)}
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

function TimelineEditStrip(props: {
  activeTool: EditorTool;
  activeDuration: number;
  selectedZoomEffect: ZoomEffect | null;
  onRemoveZoom: (id: string) => void;
  onZoomChange: (id: string, updates: Partial<ZoomEffect>) => void;
}) {
  if (props.activeTool === "zoom" && props.selectedZoomEffect) {
    const effect = props.selectedZoomEffect;

    return (
      <div className="timeline-edit-strip">
        <div className="timeline-edit-title">
          <WandSparkles size={15} />
          <strong>{effect.direction === "in" ? "Zoom in" : "Zoom out"}</strong>
        </div>
        <label>
          <span>Start</span>
          <input
            type="number"
            min={0}
            max={props.activeDuration}
            step={0.1}
            value={Number(effect.start.toFixed(1))}
            onChange={(event) =>
              props.onZoomChange(effect.id, {
                start: Math.min(Number(event.target.value), effect.end - 0.1)
              })
            }
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="number"
            min={effect.start + 0.1}
            max={props.activeDuration}
            step={0.1}
            value={Number(effect.end.toFixed(1))}
            onChange={(event) =>
              props.onZoomChange(effect.id, {
                end: Math.max(Number(event.target.value), effect.start + 0.1)
              })
            }
          />
        </label>
        <label className="timeline-edit-range">
          <span>Strength</span>
          <input
            type="range"
            min={10}
            max={60}
            value={Math.round(effect.intensity * 100)}
            onChange={(event) =>
              props.onZoomChange(effect.id, { intensity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <button
          className="timeline-delete-button"
          type="button"
          onClick={() => props.onRemoveZoom(effect.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  return null;
}

function TimelineVideoCutControls(props: {
  duration: number;
  range: { start: number; end: number };
  onAddMergeClip: () => void;
  onTrimEndChange: (value: number) => void;
  onTrimStartChange: (value: number) => void;
}) {
  return (
    <div className="timeline-video-cut-controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="timeline-edit-title">
        <Scissors size={15} />
        <strong>Cut</strong>
      </div>
      <label>
        <span>Start</span>
        <input
          type="number"
          min={0}
          max={props.duration}
          step={0.1}
          value={Number(props.range.start.toFixed(1))}
          onChange={(event) => props.onTrimStartChange(Number(event.target.value))}
        />
      </label>
      <label>
        <span>End</span>
        <input
          type="number"
          min={props.range.start + 0.1}
          max={props.duration}
          step={0.1}
          value={Number(props.range.end.toFixed(1))}
          onChange={(event) => props.onTrimEndChange(Number(event.target.value))}
        />
      </label>
      <label className="timeline-edit-range">
        <span>Trim</span>
        <input
          type="range"
          min={0}
          max={Math.max(props.duration, 1)}
          step={0.1}
          value={props.range.start}
          onChange={(event) => props.onTrimStartChange(Number(event.target.value))}
        />
      </label>
      <button className="timeline-merge-button" type="button" onClick={props.onAddMergeClip}>
        <Combine size={14} />
        Merge
      </button>
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
  return (
    <div className={`timeline-track ${props.controls ? "timeline-track-with-controls" : ""}`}>
      <div className={`track-label track-${props.accent}`}>
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="track-lane">{props.children}</div>
      {props.controls ? <div className="timeline-track-controls">{props.controls}</div> : null}
    </div>
  );
}

function TimelineClip(props: {
  clip: TimelineMediaClip;
  timelineDuration: number;
  selected: boolean;
  selectedSegment: boolean;
  waveform?: number[];
  onSelect: () => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
}) {
  const item = props.clip.item;
  const className =
    item.kind === "audio"
      ? "clip clip-audio"
      : item.kind === "image"
        ? "clip clip-image"
        : "clip clip-main";

  return (
    <button
      className={`${className} ${props.selected ? "clip-selected" : ""} ${
        props.selectedSegment ? "clip-segment-selected" : ""
      }`}
      type="button"
      data-segment-id={props.clip.id}
      style={createTimelineClipStyle(props.clip.start, props.clip.duration, props.timelineDuration)}
      onClick={props.onSelect}
    >
      <span
        className="clip-edge clip-edge-start"
        onPointerDown={(event) => props.onTrimPointerDown(event, props.clip.id, "start")}
      />
      {item.kind === "audio" ? (
        <AudioWaveform values={props.waveform} />
      ) : (
        <>
          <span className="clip-thumb" />
          <Film size={13} />
        </>
      )}
      <strong>{item.name}</strong>
      <span
        className="clip-edge clip-edge-end"
        onPointerDown={(event) => props.onTrimPointerDown(event, props.clip.id, "end")}
      />
    </button>
  );
}

function AudioWaveform(props: { values?: number[] }) {
  const values = props.values?.length ? props.values : createFallbackWaveform("audio");

  return (
    <span className="waveform" aria-hidden="true">
      {values.map((value, index) => (
        <i
          key={index}
          style={{ height: `${Math.max(12, Math.min(100, value * 100))}%` }}
        />
      ))}
    </span>
  );
}

function TimelineZoomClip(props: {
  effect: ZoomEffect;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`clip clip-zoom ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={createTimelineClipStyle(
        props.effect.start,
        props.effect.end - props.effect.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      {props.effect.direction === "in" ? <ZoomIn size={13} /> : <ZoomOut size={13} />}
      <strong>{props.effect.direction === "in" ? "Zoom in" : "Zoom out"}</strong>
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
      className={`clip clip-trim ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={createTimelineClipStyle(
        props.range.start,
        props.range.end - props.range.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      <Scissors size={13} />
      <strong>
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
      className={`clip clip-text ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={createTimelineClipStyle(
        props.subtitle.start,
        props.subtitle.end - props.subtitle.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      <Captions size={13} />
      <strong>{props.subtitle.text}</strong>
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

  if (item.id === selectedItemId && activeDuration > 0) {
    return activeDuration;
  }

  if (item.kind === "image") {
    return Math.min(Math.max(activeDuration, 5), 5);
  }

  return Math.max(activeDuration, 1);
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
      const wasPlaceholderFullClip =
        segment.start === 0 &&
        segment.sourceStart === 0 &&
        segment.end <= 1.05 &&
        itemDuration > 1.05;
      const end = wasPlaceholderFullClip
        ? itemDuration
        : clampNumber(segment.end, segment.start + 0.1, itemDuration);

      return {
        ...segment,
        end,
        sourceStart: clampNumber(segment.sourceStart, 0, Math.max(0, itemDuration - 0.1))
      };
    });

  for (const item of items) {
    if (!newItemIds.has(item.id) || nextSegments.some((segment) => segment.itemId === item.id)) {
      continue;
    }

    nextSegments.push({
      id: `${item.id}:segment-0`,
      itemId: item.id,
      track: getTimelineTrackKind(item),
      start: 0,
      end: mediaDurationById.get(item.id) ?? 1,
      sourceStart: 0
    });
  }

  return areTimelineSegmentsEqual(currentSegments, nextSegments) ? currentSegments : nextSegments;
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
  return segments.map((segment) => {
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), Math.max(min, max));
}

async function decodeAudioWaveform(url: string, barCount = 96): Promise<number[]> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("AudioContext is not available.");
  }
  const audioContext = new AudioContextConstructor();

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));

    return Array.from({ length: barCount }, (_value, index) => {
      const start = index * samplesPerBar;
      const end = Math.min(channelData.length, start + samplesPerBar);
      let peak = 0;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        peak = Math.max(peak, Math.abs(channelData[sampleIndex]));
      }

      return Math.min(1, Math.max(0.08, peak));
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function createFallbackWaveform(seed: string, barCount = 64): number[] {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return Array.from({ length: barCount }, (_value, index) => {
    const wave = Math.sin((index + 1) * 0.72 + hash * 0.0001);
    const pulse = Math.sin((index + 1) * 1.73 + hash * 0.0007);
    return clampNumber(0.18 + Math.abs(wave) * 0.52 + Math.abs(pulse) * 0.22, 0.12, 1);
  });
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

function compactMediaElements(
  elements: Array<HTMLMediaElement | null>
): HTMLMediaElement[] {
  return elements.filter((element): element is HTMLMediaElement => Boolean(element));
}

function getActiveZoom(effects: ZoomEffect[], time: number): { scale: number } {
  const effect = effects.find((item) => time >= item.start && time <= item.end);

  if (!effect) {
    return { scale: 1 };
  }

  const duration = Math.max(0.1, effect.end - effect.start);
  const rawProgress = Math.min(1, Math.max(0, (time - effect.start) / duration));
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const zoomProgress = effect.direction === "in" ? progress : 1 - progress;

  return {
    scale: 1 + effect.intensity * zoomProgress
  };
}

function createTimelineTicks(duration: number): string[] {
  const safeDuration = Math.max(duration, 10);
  const tickCount = 6;

  return Array.from({ length: tickCount }, (_value, index) =>
    formatSeconds((safeDuration / (tickCount - 1)) * index)
  );
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
