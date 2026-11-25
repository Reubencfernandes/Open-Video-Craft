/**
 * Editor-only types (tools, layout modes, timeline segments/clips, effects,
 * subtitles) and shared constants (frame rate, drag mime type).
 */
import type { ImportedMediaKind } from "../../shared/types";
import type {
  CameraClipStyle,
  CameraFrame,
  LayoutMode,
  TimelineSegment,
  TimelineTrackKind
} from "../../shared/editor-domain";

export type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraClipStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  ClipTransition,
  ClipEdgeTransition,
  CalloutBoxStyle,
  ClipTransitionType,
  LayoutMode,
  ScreenAspectRatio,
  ScreenCrop,
  SpeedEffect,
  SpeedRate,
  SubtitleSegment,
  SubtitleStyle,
  SubtitleWord,
  TextAnimation,
  TextFontFamily,
  TextOverlay,
  TimelineSegment,
  TimelineTrackKind,
  VideoCornerStyle,
  ZoomEasing,
  ZoomEffect,
  ZoomSpeed
} from "../../shared/editor-domain";

export type MediaPanel = "all" | "video" | "audio" | "image";
export type EditorTool =
  | "media"
  | "layout"
  | "audio"
  | "music"
  | "assistant"
  | "zoom"
  | "speed"
  | "transitions"
  | "subtitles"
  | "text"
  | "style";
export type TimelineTrimEdge = "start" | "end";

export type EditorMediaItem = {
  id: string;
  name: string;
  url: string;
  kind: ImportedMediaKind;
  origin: "project" | "imported";
  track: "screen" | "camera" | "audio" | "imported";
  duration: number | null;
  importId?: string;
  extension?: string;
  /**
   * Video channel of a multi-source recording. Every captured video source
   * starts together at time 0 on its own channel, so the owner can pick which
   * one is shown by trimming or hiding clips.
   */
  channel?: number;
};

export type TimelineMediaClip = {
  id: string;
  item: EditorMediaItem;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  duration: number;
  sourceStart: number;
  /** Deactivated clip: kept on the timeline, not shown or heard. */
  hidden?: boolean;
  /** Layout this clip imposes while it is on screen. */
  layout?: LayoutMode;
  /** Webcam shape/border this clip imposes while it is on screen. */
  cameraStyle?: CameraClipStyle;
};

export type TimelineContextMenu = {
  x: number;
  y: number;
  time: number;
  segmentId: string | null;
} | null;

/** Stable semantic identity for one visible timeline row. */
export type TimelineLaneId =
  | "video"
  | "zoom"
  | "speed"
  | "subtitles"
  | "text"
  | `video:${number}`
  | `audio:${number}`;

/** Time and lane span painted by a mouse marquee gesture on the timeline. */
export type TimelineRangeSelection = {
  start: number;
  end: number;
  laneIds: TimelineLaneId[];
  /** True only while the pointer is actively resizing the marquee. */
  dragging?: boolean;
};

export type ScreenLayoutDragMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";

export type ScreenLayoutDrag = {
  mode: ScreenLayoutDragMode;
  startClientX: number;
  startClientY: number;
  startPosition: {
    x: number;
    y: number;
    scale: number;
  };
  boundsWidth: number;
  boundsHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  startBoundsLeft: number;
  startBoundsTop: number;
  translationWidth: number;
  translationHeight: number;
};

export type CameraLayoutDrag = {
  mode: ScreenLayoutDragMode;
  startClientX: number;
  startClientY: number;
  startFrame: CameraFrame;
  canvasWidth: number;
  canvasHeight: number;
};

export type TimelineTrimDrag = {
  segmentId: string;
  edge: TimelineTrimEdge;
  originalSegments: TimelineSegment[];
};

export const frameRate = 30;
export const mediaDragType = "application/x-ovc-media-id";
export const textDragType = "application/x-ovc-new-text";
export const transitionDragType = "application/x-ovc-transition";
