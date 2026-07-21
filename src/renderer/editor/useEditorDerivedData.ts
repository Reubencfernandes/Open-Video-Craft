/**
 * Derives memoized view data from raw editor state: media library, timeline
 * clips/tracks, playback geometry, preview styles, and selection lookups.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { ProjectView } from "../../shared/types";
import { previewBackgrounds } from "./backgrounds";
import { createProjectMedia } from "./media-utils";
import { getScreenFrameForAspectRatio } from "./layout-geometry";
import {
  calculateTimelineDuration,
  createAudioTimelineTracks,
  createTimelineMediaClips,
  getTimelineMediaDuration
} from "./timeline-utils";
import { frameRate } from "./types";
import { clampNumber } from "./utils";
import type {
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
  LayoutMode,
  MediaPanel,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineSegment,
  VideoCornerStyle,
  ZoomEffect
} from "./types";
import { getActiveZoom } from "./zoom-utils";

type ScreenPosition = {
  x: number;
  y: number;
  scale: number;
};

/** CSS clipping shared by video, image, and low-quality canvas previews. */
export function getVideoCornerStyles(style: VideoCornerStyle): Pick<
  CSSProperties,
  "borderRadius" | "clipPath"
> {
  if (style === "flat") {
    return { borderRadius: 0, clipPath: "none" };
  }

  const radius = style === "soft" ? "16px" : "32px";
  return {
    borderRadius: radius,
    clipPath: `inset(0 round ${radius})`
  };
}

/** Rounded filled-screen layouts need a small reveal for the chosen background. */
export function getVideoCornerScale(
  layoutMode: LayoutMode,
  style: VideoCornerStyle
): number {
  if (layoutMode !== "bubble-fill") return 1;
  if (style === "soft") return 0.97;
  return style === "round" ? 0.94 : 1;
}

type UseEditorDerivedDataParams = {
  project: ProjectView | null;
  importedMedia: EditorMediaItem[];
  selectedItemId: string | null;
  activePanel: MediaPanel;
  duration: number;
  timelineSegments: TimelineSegment[];
  selectedTimelineSegmentId: string | null;
  timelineViewDuration: number;
  currentTime: number;
  zoomEffects: ZoomEffect[];
  zoomPreviewTime: number | null;
  selectedZoomId: string | null;
  speedEffects: SpeedEffect[];
  selectedSpeedId: string | null;
  subtitles: SubtitleSegment[];
  selectedSubtitleId: string | null;
  textOverlays: TextOverlay[];
  selectedTextOverlayId: string | null;
  layoutMode: LayoutMode;
  screenAspectRatio: ScreenAspectRatio;
  /** Intrinsic aspect ratio (w/h) of the screen recording, once known. */
  screenMediaAspect: number | null;
  screenPosition: ScreenPosition;
  backgroundStyle: BackgroundStyle;
  customBackgroundUrl: string | null;
  cameraSize: number;
  cameraPosition: CameraPosition;
  cameraFrame: CameraFrame;
  cameraContentTransform: CameraContentTransform;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  videoCornerStyle: VideoCornerStyle;
};

export function useEditorDerivedData(params: UseEditorDerivedDataParams) {
  const {
    project,
    importedMedia,
    selectedItemId,
    activePanel,
    duration,
    timelineSegments,
    selectedTimelineSegmentId,
    timelineViewDuration,
    currentTime,
    zoomEffects,
    zoomPreviewTime,
    selectedZoomId,
    speedEffects,
    selectedSpeedId,
    subtitles,
    selectedSubtitleId,
    textOverlays,
    selectedTextOverlayId,
    layoutMode,
    screenAspectRatio,
    screenMediaAspect,
    screenPosition,
    backgroundStyle,
    customBackgroundUrl,
    cameraSize,
    cameraPosition,
    cameraFrame,
    cameraContentTransform,
    cameraShape,
    cameraBorderStyle,
    videoCornerStyle
  } = params;

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

  // The camera feed rides along with the screen recording and is never an
  // independent timeline clip.
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
    [currentTime, videoTimelineClips]
  );
  const previewItem = activeVideoClip?.item ?? null;
  const isProjectCompositionSelected = Boolean(
    previewItem && previewItem.origin === "project" && previewItem.track === "screen"
  );
  const timelineDuration = useMemo(
    () =>
      calculateTimelineDuration(
        videoTimelineClips,
        audioTimelineClips,
        zoomEffects,
        speedEffects,
        subtitles,
        activeDuration,
        textOverlays
      ),
    [activeDuration, audioTimelineClips, speedEffects, subtitles, textOverlays, videoTimelineClips, zoomEffects]
  );
  const timelineRenderDuration = Math.max(timelineViewDuration, timelineDuration);
  const totalFrames = Math.max(1, Math.floor(timelineRenderDuration * frameRate));
  const currentFrame = Math.min(totalFrames, Math.max(0, Math.round(currentTime * frameRate)));
  const playheadPercent =
    timelineRenderDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / timelineRenderDuration) * 100))
      : 0;
  const activeZoom = getActiveZoom(zoomEffects, zoomPreviewTime ?? currentTime);
  const activeSubtitle =
    subtitles.find((subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end) ??
    null;
  const selectedSubtitle =
    subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? subtitles[0] ?? null;
  const selectedTextOverlay =
    textOverlays.find((overlay) => overlay.id === selectedTextOverlayId) ?? textOverlays[0] ?? null;
  const selectedZoomEffect =
    zoomEffects.find((effect) => effect.id === selectedZoomId) ?? null;
  const selectedSpeedEffect =
    speedEffects.find((effect) => effect.id === selectedSpeedId) ?? null;
  const audioSources = allMedia.filter((item) => item.kind === "audio");
  const screenAspectEnabled =
    layoutMode === "screen-only" ||
    layoutMode === "bubble" ||
    layoutMode === "bubble-fill" ||
    layoutMode === "presenter" ||
    layoutMode === "side-overlap";
  const screenFrame = screenAspectEnabled
    ? getScreenFrameForAspectRatio(layoutMode, screenAspectRatio, screenMediaAspect)
    : null;
  const sideBySideScreenFrame =
    layoutMode === "side-by-side" ? { x: 40, y: 0, width: 60, height: 100 } : null;
  const activeScreenFrame = screenFrame ?? sideBySideScreenFrame;
  const screenScale =
    (screenPosition.scale / 100) *
    activeZoom.scale *
    getVideoCornerScale(layoutMode, videoCornerStyle);
  const screenStyle: CSSProperties = {
    ...(activeScreenFrame
      ? {
          left: `${activeScreenFrame.x}%`,
          top: `${activeScreenFrame.y}%`,
          right: "auto",
          bottom: "auto",
          width: `${activeScreenFrame.width}%`,
          height: `${activeScreenFrame.height}%`
        }
      : {}),
    ...getVideoCornerStyles(videoCornerStyle),
    objectFit: layoutMode === "bubble-fill" || layoutMode === "side-by-side" ? "cover" : "contain",
    transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
      3
    )})`,
    transformOrigin: `${activeZoom.originX}% ${activeZoom.originY}%`
  };
  const cameraFreeformEnabled =
    layoutMode === "bubble" ||
    layoutMode === "bubble-fill" ||
    layoutMode === "presenter" ||
    layoutMode === "side-overlap";
  const baseCameraStyle: CSSProperties = {
    border:
      cameraBorderStyle === "none"
        ? 0
        : cameraBorderStyle === "accent"
          ? "3px solid rgb(249 169 22)"
          : "4px solid white",
    borderRadius:
      cameraShape === "circle" ? "999px" : cameraShape === "rounded" ? 12 : 0,
    boxSizing: "border-box",
    overflow: "hidden"
  };
  const cameraCropScale = Math.max(1, cameraContentTransform.scale / 100);
  const cameraPanLimit = ((cameraCropScale - 1) / (2 * cameraCropScale)) * 100;
  const cameraPanX = clampNumber(cameraContentTransform.x, -cameraPanLimit, cameraPanLimit);
  const cameraPanY = clampNumber(cameraContentTransform.y, -cameraPanLimit, cameraPanLimit);
  const cameraVideoStyle: CSSProperties = {
    objectFit: "cover",
    transform: `translate(${cameraPanX}%, ${cameraPanY}%) scale(${
      cameraContentTransform.mirrored ? -cameraCropScale : cameraCropScale
    }, ${cameraCropScale})`,
    transformOrigin: "center"
  };
  const cameraStyle: CSSProperties | null =
    layoutMode === "camera-only"
      ? {
          ...baseCameraStyle,
          left: 0,
          top: 0,
          width: "100%",
          height: "100%"
        }
      : layoutMode === "side-by-side"
        ? {
            ...baseCameraStyle,
            left: 0,
            top: 0,
            width: "40%",
            height: "100%",
            borderRadius: 0,
            border: 0
          }
        : cameraFreeformEnabled
          ? {
              ...baseCameraStyle,
              left: `${cameraFrame.x}%`,
              top: `${cameraFrame.y}%`,
              right: "auto",
              bottom: "auto",
              width: `${cameraFrame.size}%`,
              height: "auto",
              aspectRatio: "1 / 1",
              transform: "none"
            }
          : null;
  // Direct manipulation is always available in the viewport. The Layout tool
  // exposes detailed controls, but no longer gates drag/resize interactions.
  const screenEditEnabled = layoutMode !== "camera-only";
  const cameraEditEnabled =
    cameraFreeformEnabled && Boolean(projectCamera);
  const previewFrameStyle = {
    "--camera-size": `${cameraSize}%`,
    backgroundColor: "#050608",
    backgroundImage:
      backgroundStyle === "custom" && customBackgroundUrl
        ? `linear-gradient(135deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.34)), url("${customBackgroundUrl}")`
        : previewBackgrounds[backgroundStyle],
    backgroundPosition: "center",
    backgroundSize: "cover"
  } as CSSProperties;
  // Size the 16:9 frame to the largest that fits the stage in BOTH axes (the
  // stage is a size container), so a short/narrow window never clips the
  // preview. Zoom scales that fit; >100% overflows into the scrollable stage.
  const previewClassName =
    "relative w-[calc(min(100cqw,177.7778cqh)*var(--preview-zoom,1))] flex-none aspect-video overflow-hidden bg-[#030405] shadow-[0_18px_60px_rgb(0_0_0_/_0.58)] ring-1 ring-black/80";
  // Keep the shared time axis visible while switching tools. Effects and
  // subtitles must not disappear just because Layout or Style is selected.
  const timelineVisible = true;

  return {
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
  };
}
