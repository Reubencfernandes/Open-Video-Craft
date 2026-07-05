import type { ImportedMediaKind } from "../../shared/types";

export type MediaPanel = "all" | "video" | "audio" | "image";
export type EditorTool = "media" | "layout" | "audio" | "zoom" | "subtitles" | "cut" | "style";
export type LayoutMode =
  | "screen-only"
  | "camera-only"
  | "bubble"
  | "bubble-fill"
  | "presenter"
  | "side-by-side"
  | "side-overlap";
export type BackgroundStyle =
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
export type BackgroundCategory = "animated" | "image" | "gradient";
export type CameraPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type CameraShape = "circle" | "rounded" | "square";
export type CameraBorderStyle = "none" | "light" | "accent";
export type VideoCornerStyle = "flat" | "soft" | "round";
export type ScreenAspectRatio = "16:9" | "16:10" | "4:3";
export type TimelineTrackKind = "video" | "audio";
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

export type TimelineSegment = {
  id: string;
  itemId: string;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  end: number;
  sourceStart: number;
};

export type TimelineContextMenu = {
  x: number;
  y: number;
  time: number;
  segmentId: string | null;
} | null;

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
};

export type CameraFrame = {
  x: number;
  y: number;
  size: number;
};

export type CameraContentTransform = {
  x: number;
  y: number;
  scale: number;
  mirrored: boolean;
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

export type ZoomSpeed = "slow" | "medium" | "fast";

export type ZoomEffect = {
  id: string;
  start: number;
  end: number;
  speed: ZoomSpeed;
  scale: number;
  targetX: number;
  targetY: number;
};

export type SubtitleStyle = "clean" | "karaoke" | "boxed" | "pop";

export type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

export const frameRate = 30;
export const mediaDragType = "application/x-ovc-media-id";
