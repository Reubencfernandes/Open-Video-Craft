/**
 * Serializable editor-domain contracts shared by the renderer, Electron main
 * process, MCP server, export worker, and tests. Keep this module free of
 * runtime dependencies so every process agrees on the persisted file shape.
 */
import type { AudioCleanupPreset, AudioCleanupSettings, AudioCleanupState } from "./audio-cleanup";

export type { AudioCleanupPreset, AudioCleanupSettings, AudioCleanupState };

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

/**
 * Camera presentation a single clip imposes while it is on screen. Every
 * property is optional and falls back to the project style, so a clip can
 * restyle only the border or only the shape.
 */
export interface CameraClipStyle {
  shape?: CameraShape;
  border?: CameraBorderStyle;
}
export type VideoCornerStyle = "flat" | "soft" | "round";
export type ScreenAspectRatio = "auto" | "16:9" | "16:10" | "4:3";
export type TimelineTrackKind = "video" | "audio";
export type ZoomSpeed = "slow" | "medium" | "fast";
export type ZoomEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "custom";
export type SpeedRate = 1 | 1.25 | 1.5 | 2 | 3 | 4 | 5;
export type SubtitleStyle = "clean" | "karaoke" | "boxed" | "pop";
export type TextAnimation =
  | "none" | "fade" | "pop" | "slide-up"
  | "fade-in-out" | "pop-in-out" | "slide-in-out";
export type TextFontFamily = "sans" | "rounded" | "serif" | "mono";
export type ClipTransitionType = "crossfade" | "fade-black" | "slide-left" | "wipe-left";
export type PreviewQuality = "high" | "low";
export type AgentMediaPlacement = "media-bin" | "timeline" | "background-audio" | "custom-background";
export type AgentMusicEngine = "claude-local" | "lyria-clip" | "lyria-pro";

export interface TimelineSegment {
  id: string;
  itemId: string;
  track: TimelineTrackKind;
  lane: number;
  start: number;
  end: number;
  sourceStart: number;
  /** Only automatically created clips awaiting media metadata may grow. */
  pendingDuration?: boolean;
  /**
   * Deactivated clip: it stays on the timeline so its range is not lost, but it
   * is not shown or heard. Used to pick which recording channel is on screen.
   */
  hidden?: boolean;
  /**
   * Layout that applies while this clip is on screen, overriding the project
   * layout for that stretch of the timeline.
   */
  layout?: LayoutMode;
  /**
   * Webcam shape and border that apply while this clip is on screen,
   * overriding the project style for that stretch of the timeline.
   */
  cameraStyle?: CameraClipStyle;
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

/** A transition at the isolated start or end edge of one clip. */
export interface ClipEdgeTransition {
  id: string;
  segmentId: string;
  edge: "start" | "end";
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

/** Visual style for a titled callout panel around overlay text. */
export interface CalloutBoxStyle {
  readonly backgroundColor: string;
  readonly backgroundOpacity: number;
  readonly borderColor: string;
  readonly borderWidth: number;
  readonly borderRadius: number;
  readonly padding: number;
  readonly titleColor: string;
  readonly titleSize: number;
}

/** Timed freeform text rendered independently from captions/subtitles. */
export interface TextOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  /** Optional heading; when absent the overlay remains plain text. */
  title?: string;
  /** Optional panel style; when absent the overlay has no visible box. */
  box?: CalloutBoxStyle;
  x: number;
  y: number;
  size: number;
  color: string;
  /** Optional for compatibility with projects saved before typography controls. */
  fontFamily?: TextFontFamily;
  /** Percentage opacity; older projects default to 100. */
  opacity?: number;
  weight: 400 | 600 | 700 | 800;
  animation: TextAnimation;
}

export interface ScreenPositionState { x: number; y: number; scale: number }

/**
 * Non-destructive crop of the recorded screen, in percent of the source frame.
 * Used to remove OS chrome such as a menu bar or a browser address bar without
 * touching the recorded file.
 */
export interface ScreenCrop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface CameraFrame { x: number; y: number; size: number }
export interface CameraContentTransform { x: number; y: number; scale: number; mirrored: boolean }
export interface AudioLevel {
  volume: number;
  muted: boolean;
  /** Optional so older editor documents stay valid. */
  fadeIn?: number;
  fadeOut?: number;
}

export interface YouTubeVolumeSettings {
  enabled: boolean;
  targetLufs: number;
  truePeakDb: number;
}

export type AudioLevelState = Record<string, AudioLevel>;
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
  edgeTransitions?: ClipEdgeTransition[];
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
  /** Optional so projects saved before cropping stay valid. */
  screenCrop?: ScreenCrop;
  screenAspectRatio: ScreenAspectRatio;
  cameraFrame: CameraFrame;
  masterVolume: number;
  audioLevels: AudioLevelState;
  /** Optional YouTube-safe loudness normalization for exported audio. */
  youtubeVolume?: YouTubeVolumeSettings;
  /** Optional so older schema-v2 projects load without migration. */
  audioCleanup?: AudioCleanupState;
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
  | { type: "set_audio"; itemId: string; gainDb: number; muted: boolean; fadeIn?: number; fadeOut?: number }
  | { type: "set_youtube_volume"; enabled: boolean; targetLufs?: number; truePeakDb?: number }
  | { type: "set_audio_cleanup"; itemId: string; preset: AudioCleanupPreset; strength: number }
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
