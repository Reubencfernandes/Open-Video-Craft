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
    const snapshot = (typeof raw === "string" ? JSON.parse(raw) : raw) as unknown;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return false;
    }
    const state = snapshot as Record<string, unknown>;
    if (Array.isArray(state.timelineSegments)) {
      const segments = state.timelineSegments as TimelineSegment[];
      actions.setTimelineSegments(segments);
      for (const segment of segments) {
        actions.addKnownTimelineItemId(segment.itemId);
      }
    }
    if (Array.isArray(state.zoomEffects)) {
      actions.setZoomEffects(state.zoomEffects as ZoomEffect[]);
    }
    if (Array.isArray(state.speedEffects)) {
      actions.setSpeedEffects(state.speedEffects as SpeedEffect[]);
    }
    if (Array.isArray(state.subtitles)) {
      actions.setSubtitles(state.subtitles as SubtitleSegment[]);
    }
    if (state.subtitleLanguage === null || typeof state.subtitleLanguage === "string") {
      actions.setSubtitleLanguage(state.subtitleLanguage);
    }
    if (state.subtitleStyle) {
      actions.setSubtitleStyle(state.subtitleStyle as SubtitleStyle);
    }
    if (state.layoutMode) {
      actions.setLayoutMode(state.layoutMode as LayoutMode);
    }
    if (state.backgroundStyle) {
      actions.setBackgroundStyle(state.backgroundStyle as BackgroundStyle);
    }
    if (state.activeBackgroundCategory) {
      actions.setActiveBackgroundCategory(
        state.activeBackgroundCategory as BackgroundCategory
      );
    }
    if (typeof state.cameraSize === "number") {
      actions.setCameraSize(state.cameraSize);
    }
    if (state.cameraPosition) {
      actions.setCameraPosition(state.cameraPosition as CameraPosition);
    }
    if (state.cameraShape) {
      actions.setCameraShape(state.cameraShape as CameraShape);
    }
    if (state.cameraBorderStyle) {
      actions.setCameraBorderStyle(state.cameraBorderStyle as CameraBorderStyle);
    }
    if (state.cameraContentTransform) {
      actions.setCameraContentTransform(
        state.cameraContentTransform as CameraContentTransform
      );
    }
    if (state.videoCornerStyle) {
      actions.setVideoCornerStyle(state.videoCornerStyle as VideoCornerStyle);
    }
    if (state.screenPosition) {
      actions.setScreenPosition(state.screenPosition as ScreenPositionState);
    }
    if (state.screenAspectRatio) {
      actions.setScreenAspectRatio(state.screenAspectRatio as ScreenAspectRatio);
    }
    if (state.cameraFrame) {
      actions.setCameraFrame(state.cameraFrame as CameraFrame);
    }
    if (typeof state.masterVolume === "number") {
      actions.setMasterVolume(state.masterVolume);
    }
    if (state.audioLevels && typeof state.audioLevels === "object") {
      actions.setAudioLevels(state.audioLevels as AudioLevelState);
    }
    if (Array.isArray(state.backgroundAudioIds)) {
      actions.setBackgroundAudioIds(
        state.backgroundAudioIds.filter((item): item is string => typeof item === "string")
      );
    }
    if (
      state.customBackgroundImportId === null ||
      typeof state.customBackgroundImportId === "string"
    ) {
      actions.setCustomBackgroundImportId(state.customBackgroundImportId);
    }
    if (isTrimRange(state.trimRange)) {
      actions.setTrimRange(state.trimRange);
    }

    return true;
  } catch {
    return false;
  }
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
