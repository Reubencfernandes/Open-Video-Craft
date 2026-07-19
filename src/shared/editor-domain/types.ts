/**
 * Serializable editor-domain contracts shared by the renderer, Electron main
 * process, MCP server, export worker, and tests. Keep this module free of
 * runtime dependencies so every process agrees on the persisted file shape.
 */
export type LayoutMode =
  | "screen-only"
  | "camera-only"
  | "bubble"
  | "bubble-fill"
  | "presenter"
  | "side-by-side"
  | "side-overlap";

export type BackgroundStyle =
  | "real-world-1" | "real-world-2" | "real-world-3" | "real-world-4"
  | "real-world-5" | "real-world-6" | "gradient-1" | "gradient-2"
  | "gradient-3" | "animated-1" | "animated-2" | "animated-3" | "custom";
export type BackgroundCategory = "animated" | "image" | "gradient";
export type CameraPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
export type CameraShape = "circle" | "rounded" | "square";
export type CameraBorderStyle = "none" | "light" | "accent";
export type VideoCornerStyle = "flat" | "soft" | "round";
export type ScreenAspectRatio = "auto" | "16:9" | "16:10" | "4:3";
export type TimelineTrackKind = "video" | "audio";
export type ZoomSpeed = "slow" | "medium" | "fast";
export type ZoomEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "custom";
export type SpeedRate = 1 | 2 | 3 | 4 | 5;
export type SubtitleStyle = "clean" | "karaoke" | "boxed" | "pop";
export type TextAnimation = "none" | "fade" | "pop" | "slide-up";
export type ClipTransitionType = "crossfade" | "fade-black" | "slide-left" | "wipe-left";
export type PreviewQuality = "high" | "low";
export type AgentMediaPlacement = "media-bin" | "timeline" | "background-audio" | "custom-background";
export type AgentMusicEngine = "lyria-clip" | "lyria-pro";

export interface TimelineSegment {
  id: string;
  itemId: string;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  end: number;
  sourceStart: number;
}

export interface ZoomEffect {
  id: string;
  start: number;
  end: number;
  speed: ZoomSpeed;
  easing?: ZoomEasing;
  bezier?: [number, number, number, number];
  scale: number;
  targetX: number;
  targetY: number;
}

export interface SpeedEffect {
  id: string;
  start: number;
  end: number;
  rate: SpeedRate;
}

/** A rendered transition centered on the cut between two adjacent video clips. */
export interface ClipTransition {
  id: string;
  fromSegmentId: string;
  toSegmentId: string;
  type: ClipTransitionType;
  duration: number;
}

export interface SubtitleWord { start: number; end: number; text: string }
export interface SubtitleSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
}

/** Timed freeform text rendered independently from captions/subtitles. */
export interface TextOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  weight: 400 | 600 | 700 | 800;
  animation: TextAnimation;
}

export interface ScreenPositionState { x: number; y: number; scale: number }
export interface CameraFrame { x: number; y: number; size: number }
export interface CameraContentTransform { x: number; y: number; scale: number; mirrored: boolean }
export type AudioLevelState = Record<string, { volume: number; muted: boolean }>;
export interface TrimRange { start: number; end: number }

/** One-shot renderer command persisted by an AI edit and consumed by the open app. */
export interface PendingMediaImport {
  requestId: string;
  paths: string[];
  placement: AgentMediaPlacement;
  timelineStart: number;
}

/** One-shot Lyria command consumed by the open app so provider keys stay in Electron. */
export interface PendingMusicGeneration {
  requestId: string;
  engine: AgentMusicEngine;
  prompt: string;
  lyrics: string;
}

export interface EditorStateSnapshot {
  v: 2;
  timelineSegments: TimelineSegment[];
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  /** Optional so existing schema-v2 projects load without a visible migration. */
  transitions?: ClipTransition[];
  subtitles: SubtitleSegment[];
  /** Optional so schema-v2 projects saved before text overlays still load. */
  textOverlays?: TextOverlay[];
  subtitleLanguage: string | null;
  subtitleStyle: SubtitleStyle;
  layoutMode: LayoutMode;
  backgroundStyle: BackgroundStyle;
  activeBackgroundCategory: BackgroundCategory;
  cameraSize: number;
  cameraPosition: CameraPosition;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  cameraContentTransform: CameraContentTransform;
  videoCornerStyle: VideoCornerStyle;
  screenPosition: ScreenPositionState;
  screenAspectRatio: ScreenAspectRatio;
  cameraFrame: CameraFrame;
  masterVolume: number;
  audioLevels: AudioLevelState;
  backgroundAudioIds: string[];
  customBackgroundImportId: string | null;
  trimRange: TrimRange;
  /** Optional so older schema-v2 projects remain valid without migration. */
  previewQuality?: PreviewQuality;
  timelineZoom?: number;
  previewZoom?: number;
  pendingMediaImport?: PendingMediaImport | null;
  pendingMusicGeneration?: PendingMusicGeneration | null;
}

export interface EditorImportRecord {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  extension: string;
  duration: number | null;
  relativePath: string;
}

export interface EditorMutation {
  source: "editor" | "agent";
  at: string;
  editId: string | null;
  summary: string | null;
}

export interface EditorDocument {
  schemaVersion: 2;
  revision: number;
  savedAt: string;
  state: EditorStateSnapshot;
  imports: EditorImportRecord[];
  lastMutation: EditorMutation;
}

/**
 * Constrained operations available to an external editing agent. Zoom and
 * speed are first-class editor effects; callers can inspect exportCapabilities
 * separately before claiming that a particular exporter renders them.
 */
export type EditorEditOperation =
  | { type: "remove_ranges"; ranges: Array<{ start: number; end: number }>; ripple: true }
  | { type: "split_clip"; segmentId: string; at: number }
  | { type: "trim_clip"; segmentId: string; timelineStart?: number; timelineEnd?: number }
  | { type: "delete_clip"; segmentId: string; ripple: boolean }
  | { type: "move_clip"; segmentId: string; timelineStart: number; lane?: number }
  | { type: "sequence_clips"; segmentIds: string[]; start: number; gap: number }
  | { type: "set_audio"; itemId: string; gainDb: number; muted: boolean }
  | { type: "set_audio_lane"; lane: number; gainDb: number; muted: boolean }
  | { type: "set_master_volume"; volume: number }
  | { type: "set_background_audio"; itemIds: string[] }
  | { type: "set_layout"; layoutMode: LayoutMode }
  | {
      type: "set_background";
      style: BackgroundStyle;
      category: BackgroundCategory;
      customImportId?: string | null;
    }
  | {
      type: "set_camera";
      size?: number;
      position?: CameraPosition;
      shape?: CameraShape;
      borderStyle?: CameraBorderStyle;
      contentTransform?: CameraContentTransform;
      frame?: CameraFrame;
    }
  | {
      type: "set_screen";
      position?: ScreenPositionState;
      aspectRatio?: ScreenAspectRatio;
      cornerStyle?: VideoCornerStyle;
    }
  | { type: "set_text_overlay"; overlay: TextOverlay }
  | { type: "remove_text_overlay"; id: string }
  | { type: "set_subtitle_preferences"; language?: string | null; style?: SubtitleStyle }
  | {
      type: "set_editor_view";
      previewQuality?: PreviewQuality;
      timelineZoom?: number;
      previewZoom?: number;
    }
  | {
      type: "import_media";
      paths: string[];
      placement: AgentMediaPlacement;
      timelineStart?: number;
    }
  | {
      type: "generate_music";
      engine: AgentMusicEngine;
      prompt: string;
      lyrics?: string;
    }
  | {
      type: "set_zoom";
      id: string;
      start: number;
      end: number;
      speed: ZoomSpeed;
      easing?: ZoomEasing;
      bezier?: [number, number, number, number];
      scale: number;
      targetX: number;
      targetY: number;
    }
  | { type: "remove_zoom"; id: string }
  | { type: "set_speed"; id: string; start: number; end: number; rate: SpeedRate }
  | { type: "remove_speed"; id: string }
  | { type: "set_transition"; fromSegmentId: string; toSegmentId: string; transition: ClipTransitionType; duration: number }
  | { type: "remove_transition"; fromSegmentId: string; toSegmentId: string }
  | { type: "replace_subtitles"; language: string | null; style: SubtitleStyle; segments: SubtitleSegment[] }
  | { type: "update_subtitle"; id: string; start?: number; end?: number; text?: string }
  | { type: "set_export_range"; start: number; end: number };

export interface EditorEditResult {
  state: EditorStateSnapshot;
  affectedClipIds: string[];
  warnings: string[];
  previousDuration: number;
  duration: number;
}
