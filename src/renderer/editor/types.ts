/**
 * Editor-only types (tools, layout modes, timeline segments/clips, effects,
 * subtitles) and shared constants (frame rate, drag mime type).
 */
import type { ImportedMediaKind } from "../../shared/types";
import type {
  CameraFrame,
  TimelineSegment,
  TimelineTrackKind
} from "../../shared/editor-domain";

export type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  ClipTransition,
  ClipTransitionType,
  LayoutMode,
  ScreenAspectRatio,
  SpeedEffect,
  SpeedRate,
  SubtitleSegment,
  SubtitleStyle,
  SubtitleWord,
  TextAnimation,
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
};

export type TimelineMediaClip = {
  id: string;
  item: EditorMediaItem;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  duration: number;
  sourceStart: number;
};

export type TimelineContextMenu = {
  x: number;
  y: number;
  time: number;
  segmentId: string | null;
} | null;

/** Time span painted by a mouse range-selection gesture on the timeline. */
export type TimelineRangeSelection = {
  start: number;
  end: number;
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
