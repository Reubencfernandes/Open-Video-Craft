/**
 * Derives memoized view data from raw editor state: media library, timeline
 * clips/tracks, playback geometry, preview styles, and selection lookups.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { ProjectView } from "../../shared/types";
import { previewBackgrounds } from "./backgrounds";
import { createProjectMedia } from "./media-utils";
import { screenCropTransform } from "../../shared/editor-domain/screen-crop";
import { findActiveSubtitleAtTime } from "./subtitle-time";
import { resolvePreviewComposition } from "./composition-layers";
import { resolveCameraBorder } from "../../shared/editor-domain/timeline-visibility";
import {
  calculateTimelineDuration,
  createAudioTimelineTracks,
  createTimelineMediaClips,
  getTimelineMediaDuration
} from "./timeline-utils";
import { frameRate } from "./types";
import type { ScreenCrop } from "../../shared/editor-domain/types";
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

/** Corner styling clips the existing frame and must never change its size. */
export function getVideoCornerScale(
  _layoutMode: LayoutMode,
  _style: VideoCornerStyle
): number {
  return 1;
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
  screenCrop?: ScreenCrop;
  cameraMaskUrl?: string | null;
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
    screenCrop,
    cameraMaskUrl,
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
  // A camera with a channel is a timeline clip; a single-camera recording keeps
  // the floating overlay that has no clip of its own.
  const overlayCamera =
    projectMedia.find((item) => item.track === "camera" && item.channel === undefined) ?? null;
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
          ((item.kind === "video" || item.kind === "image") &&
            (item.track !== "camera" || item.channel !== undefined))
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
  const composition = useMemo(
    () =>
      resolvePreviewComposition({
        clips: videoTimelineClips,
        time: currentTime,
        projectLayout: layoutMode,
        selectedSegmentId: selectedTimelineSegmentId,
        screenAspectRatio,
        screenIntrinsicAspect: screenMediaAspect,
        cameraFrame,
        projectCameraStyle: { shape: cameraShape, border: cameraBorderStyle },
        overlayCamera
      }),
    [
      cameraBorderStyle,
      cameraFrame,
      cameraShape,
      currentTime,
      layoutMode,
      overlayCamera,
      screenAspectRatio,
      screenMediaAspect,
      selectedTimelineSegmentId,
      videoTimelineClips
    ]
  );
  // Presets compose a base picture (screen or imported video) with a webcam
  // above it. Geometry comes from the shared composition layout, so the canvas
  // and the exporter arrange the same layers.
  const effectiveLayoutMode = composition.layoutMode;
  // The preset itself decides whether the base picture is visible; a
  // camera-only layout must not leave the screen playing underneath the webcam.
  const previewItem = composition.layout.base === null ? null : composition.base?.item ?? null;
  const previewBaseClip = composition.base;
  const previewCameraClip = composition.camera;
  const previewCameraItem = composition.cameraItem;
  const showNoCameraRecording = composition.showNoCameraRecording;
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
  const activeSubtitle = findActiveSubtitleAtTime(subtitles, currentTime);
  const selectedSubtitle =
    subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? subtitles[0] ?? null;
  const selectedTextOverlay =
    textOverlays.find((overlay) => overlay.id === selectedTextOverlayId) ?? textOverlays[0] ?? null;
  const selectedZoomEffect =
    zoomEffects.find((effect) => effect.id === selectedZoomId) ?? null;
  const selectedSpeedEffect =
    speedEffects.find((effect) => effect.id === selectedSpeedId) ?? null;
  const audioSources = allMedia.filter((item) => item.kind === "audio");
  // The aspect-ratio control applies to the presets that keep the picture in a
  // fitted frame; split and filled-screen presets crop instead.
  const screenAspectEnabled =
    effectiveLayoutMode !== "camera-only" && effectiveLayoutMode !== "side-by-side";
  const activeScreenFrame = composition.layout.base?.frame ?? null;
  const screenScale =
    (screenPosition.scale / 100) *
    activeZoom.scale *
    getVideoCornerScale(effectiveLayoutMode, videoCornerStyle);
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
    // The frame clips the media so a crop never spills outside its box.
    overflow: "hidden",
    transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
      3
    )})`,
    transformOrigin: `${activeZoom.originX}% ${activeZoom.originY}%`
  };
  const screenCropCss = screenCropTransform(screenCrop);
  const screenContentStyle: CSSProperties = {
    objectFit: composition.layout.base?.fit === "cover" ? "cover" : "contain",
    ...(screenCropCss === null
      ? {}
      : { transform: screenCropCss.transform, transformOrigin: screenCropCss.transformOrigin })
  };
  const cameraFreeformEnabled =
    effectiveLayoutMode === "bubble" ||
    effectiveLayoutMode === "bubble-fill" ||
    effectiveLayoutMode === "presenter" ||
    effectiveLayoutMode === "side-overlap";
  // The border and shape come from the shared resolver, which merges the
  // webcam clip's own style over the project style, so the exported file paints
  // exactly what this preview shows. `border-box` keeps it inside the box.
  const cameraBorder = resolveCameraBorder({
    layoutMode: effectiveLayoutMode,
    borderStyle: composition.cameraStyle.border
  });
  const resolvedCameraShape = composition.cameraStyle.shape;
  const baseCameraStyle: CSSProperties = {
    border:
      cameraBorder === null ? 0 : `${cameraBorder.cssWidth}px solid #${cameraBorder.colorHex}`,
    borderRadius:
      resolvedCameraShape === "circle" ? "999px" : resolvedCameraShape === "rounded" ? 12 : 0,
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
  const cameraLayer = composition.layout.camera;
  const cameraStyle: CSSProperties | null = cameraLayer
    ? {
        ...baseCameraStyle,
        left: `${cameraLayer.frame.x}%`,
        top: `${cameraLayer.frame.y}%`,
        right: "auto",
        bottom: "auto",
        width: `${cameraLayer.frame.width}%`,
        height: `${cameraLayer.frame.height}%`,
        transform: "none",
        ...(effectiveLayoutMode === "side-by-side" ? { borderRadius: 0, border: 0 } : {})
      }
    : null;
  // A webcam mask belongs to the project's own camera track; it must never be
  // painted over a different webcam channel.
  const primaryCameraId = project === null ? null : `${project.id}:camera`;
  const previewCameraMaskUrl =
    previewCameraItem !== null && previewCameraItem.id === primaryCameraId
      ? cameraMaskUrl ?? null
      : null;
  // Direct manipulation is always available in the viewport. The Layout tool
  // exposes detailed controls, but no longer gates drag/resize interactions.
  const screenEditEnabled = composition.layout.base !== null && previewItem !== null;
  const cameraEditEnabled = cameraFreeformEnabled && previewCameraItem !== null;
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
    allMedia,
    audioSources,
    audioTimelineClips,
    audioTimelineTracks,
    cameraEditEnabled,
    cameraMaskUrl: previewCameraMaskUrl,
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
    screenContentStyle,
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
