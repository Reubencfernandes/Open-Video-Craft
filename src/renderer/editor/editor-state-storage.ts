/**
 * Serialization of editor state to/from the project's editor.json (versioned
 * snapshot shape + restore parsing).
 */
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  LayoutMode,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  SubtitleWord,
  TimelineSegment,
  VideoCornerStyle,
  ZoomEffect
} from "./types";

export type ScreenPositionState = {
  x: number;
  y: number;
  scale: number;
};

export type AudioLevelState = Record<string, { volume: number; muted: boolean }>;

export type TrimRange = {
  start: number;
  end: number;
};

export type EditorStateSnapshot = {
  v: 2;
  timelineSegments: TimelineSegment[];
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
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
};

type CreateEditorStateSnapshotInput = Omit<EditorStateSnapshot, "v">;

type RestoreEditorStateActions = {
  addKnownTimelineItemId: (itemId: string) => void;
  setActiveBackgroundCategory: (value: BackgroundCategory) => void;
  setAudioLevels: (value: AudioLevelState) => void;
  setBackgroundAudioIds: (value: string[]) => void;
  setBackgroundStyle: (value: BackgroundStyle) => void;
  setCameraBorderStyle: (value: CameraBorderStyle) => void;
  setCameraContentTransform: (value: CameraContentTransform) => void;
  setCameraFrame: (value: CameraFrame) => void;
  setCameraPosition: (value: CameraPosition) => void;
  setCameraShape: (value: CameraShape) => void;
  setCameraSize: (value: number) => void;
  setCustomBackgroundImportId: (value: string | null) => void;
  setLayoutMode: (value: LayoutMode) => void;
  setMasterVolume: (value: number) => void;
  setScreenAspectRatio: (value: ScreenAspectRatio) => void;
  setScreenPosition: (value: ScreenPositionState) => void;
  setSpeedEffects: (value: SpeedEffect[]) => void;
  setSubtitleLanguage: (value: string | null) => void;
  setSubtitleStyle: (value: SubtitleStyle) => void;
  setSubtitles: (value: SubtitleSegment[]) => void;
  setTimelineSegments: (value: TimelineSegment[]) => void;
  setVideoCornerStyle: (value: VideoCornerStyle) => void;
  setZoomEffects: (value: ZoomEffect[]) => void;
  setTrimRange: (value: TrimRange) => void;
};

export function createEditorStateSnapshot(
  input: CreateEditorStateSnapshotInput
): EditorStateSnapshot {
  return {
    v: 2,
    ...input
  };
}

export function restoreEditorStateSnapshot(
  raw: unknown,
  actions: RestoreEditorStateActions
): boolean {
  try {
    const snapshot = validateSnapshot(typeof raw === "string" ? JSON.parse(raw) : raw);
    if (!snapshot) {
      return false;
    }

    actions.setTimelineSegments(snapshot.timelineSegments);
    for (const segment of snapshot.timelineSegments) {
      actions.addKnownTimelineItemId(segment.itemId);
    }
    actions.setZoomEffects(snapshot.zoomEffects);
    actions.setSpeedEffects(snapshot.speedEffects);
    actions.setSubtitles(snapshot.subtitles);
    actions.setSubtitleLanguage(snapshot.subtitleLanguage);
    actions.setSubtitleStyle(snapshot.subtitleStyle);
    actions.setLayoutMode(snapshot.layoutMode);
    actions.setBackgroundStyle(snapshot.backgroundStyle);
    actions.setActiveBackgroundCategory(snapshot.activeBackgroundCategory);
    actions.setCameraSize(snapshot.cameraSize);
    actions.setCameraPosition(snapshot.cameraPosition);
    actions.setCameraShape(snapshot.cameraShape);
    actions.setCameraBorderStyle(snapshot.cameraBorderStyle);
    actions.setCameraContentTransform(snapshot.cameraContentTransform);
    actions.setVideoCornerStyle(snapshot.videoCornerStyle);
    actions.setScreenPosition(snapshot.screenPosition);
    actions.setScreenAspectRatio(snapshot.screenAspectRatio);
    actions.setCameraFrame(snapshot.cameraFrame);
    actions.setMasterVolume(snapshot.masterVolume);
    actions.setAudioLevels(snapshot.audioLevels);
    actions.setBackgroundAudioIds(snapshot.backgroundAudioIds);
    actions.setCustomBackgroundImportId(snapshot.customBackgroundImportId);
    actions.setTrimRange(snapshot.trimRange);

    return true;
  } catch {
    return false;
  }
}

function validateSnapshot(value: unknown): EditorStateSnapshot | null {
  if (!isRecord(value) || value.v !== 2) return null;
  const state = value;
  if (
    !isArrayOf(state.timelineSegments, isTimelineSegment) ||
    !isArrayOf(state.zoomEffects, isZoomEffect) ||
    !isArrayOf(state.speedEffects, isSpeedEffect) ||
    !isArrayOf(state.subtitles, isSubtitleSegment) ||
    !(state.subtitleLanguage === null || typeof state.subtitleLanguage === "string") ||
    !isOneOf(state.subtitleStyle, ["clean", "karaoke", "boxed", "pop"]) ||
    !isOneOf(state.layoutMode, ["screen-only", "camera-only", "bubble", "bubble-fill", "presenter", "side-by-side", "side-overlap"]) ||
    !isOneOf(state.backgroundStyle, ["real-world-1", "real-world-2", "real-world-3", "real-world-4", "real-world-5", "real-world-6", "gradient-1", "gradient-2", "gradient-3", "animated-1", "animated-2", "animated-3", "custom"]) ||
    !isOneOf(state.activeBackgroundCategory, ["animated", "image", "gradient"]) ||
    !isFiniteNumber(state.cameraSize) ||
    !isOneOf(state.cameraPosition, ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"]) ||
    !isOneOf(state.cameraShape, ["circle", "rounded", "square"]) ||
    !isOneOf(state.cameraBorderStyle, ["none", "light", "accent"]) ||
    !isCameraContentTransform(state.cameraContentTransform) ||
    !isOneOf(state.videoCornerStyle, ["flat", "soft", "round"]) ||
    !isScreenPosition(state.screenPosition) ||
    !isOneOf(state.screenAspectRatio, ["16:9", "16:10", "4:3"]) ||
    !isCameraFrame(state.cameraFrame) ||
    !isFiniteNumber(state.masterVolume) ||
    !isAudioLevels(state.audioLevels) ||
    !isArrayOf(state.backgroundAudioIds, (item): item is string => typeof item === "string") ||
    !(state.customBackgroundImportId === null || typeof state.customBackgroundImportId === "string") ||
    !isTrimRange(state.trimRange)
  ) return null;
  return state as EditorStateSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function hasTimedId(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === "string" && isFiniteNumber(value.start) && isFiniteNumber(value.end) && value.end >= value.start;
}

function isTimelineSegment(value: unknown): value is TimelineSegment {
  return hasTimedId(value) && typeof value.itemId === "string" && isOneOf(value.track, ["video", "audio"]) && Number.isInteger(value.lane) && isFiniteNumber(value.sourceStart);
}

function isZoomEffect(value: unknown): value is ZoomEffect {
  return hasTimedId(value) && isOneOf(value.speed, ["slow", "medium", "fast"]) && (value.easing === undefined || isOneOf(value.easing, ["linear", "ease-in", "ease-out", "ease-in-out", "custom"])) && isFiniteNumber(value.scale) && isFiniteNumber(value.targetX) && isFiniteNumber(value.targetY) && (value.bezier === undefined || (Array.isArray(value.bezier) && value.bezier.length === 4 && value.bezier.every(isFiniteNumber)));
}

function isSpeedEffect(value: unknown): value is SpeedEffect {
  return hasTimedId(value) && [1, 2, 3, 4, 5].includes(value.rate as number);
}

function isSubtitleSegment(value: unknown): value is SubtitleSegment {
  return hasTimedId(value) && typeof value.text === "string" && (value.words === undefined || isArrayOf(value.words, isSubtitleWord));
}

function isSubtitleWord(value: unknown): value is SubtitleWord {
  return isRecord(value) && typeof value.text === "string" && isFiniteNumber(value.start) && isFiniteNumber(value.end) && value.end >= value.start;
}

function isScreenPosition(value: unknown): value is ScreenPositionState {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.scale);
}

function isCameraFrame(value: unknown): value is CameraFrame {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.size);
}

function isCameraContentTransform(value: unknown): value is CameraContentTransform {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.scale) && typeof value.mirrored === "boolean";
}

function isAudioLevels(value: unknown): value is AudioLevelState {
  return isRecord(value) && Object.values(value).every((level) => isRecord(level) && isFiniteNumber(level.volume) && typeof level.muted === "boolean");
}

function isTrimRange(value: unknown): value is TrimRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const range = value as Partial<TrimRange>;
  return (
    typeof range.start === "number" &&
    Number.isFinite(range.start) &&
    typeof range.end === "number" &&
    Number.isFinite(range.end)
  );
}
