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

export type EditorStateSnapshot = {
  v: 1;
  timelineSegments: TimelineSegment[];
  zoomEffects: ZoomEffect[];
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
};

type CreateEditorStateSnapshotInput = Omit<EditorStateSnapshot, "v">;

type RestoreEditorStateActions = {
  addKnownTimelineItemId: (itemId: string) => void;
  setActiveBackgroundCategory: (value: BackgroundCategory) => void;
  setAudioLevels: (value: AudioLevelState) => void;
  setBackgroundStyle: (value: BackgroundStyle) => void;
  setCameraBorderStyle: (value: CameraBorderStyle) => void;
  setCameraContentTransform: (value: CameraContentTransform) => void;
  setCameraFrame: (value: CameraFrame) => void;
  setCameraPosition: (value: CameraPosition) => void;
  setCameraShape: (value: CameraShape) => void;
  setCameraSize: (value: number) => void;
  setLayoutMode: (value: LayoutMode) => void;
  setMasterVolume: (value: number) => void;
  setScreenAspectRatio: (value: ScreenAspectRatio) => void;
  setScreenPosition: (value: ScreenPositionState) => void;
  setSubtitleLanguage: (value: string | null) => void;
  setSubtitleStyle: (value: SubtitleStyle) => void;
  setSubtitles: (value: SubtitleSegment[]) => void;
  setTimelineSegments: (value: TimelineSegment[]) => void;
  setVideoCornerStyle: (value: VideoCornerStyle) => void;
  setZoomEffects: (value: ZoomEffect[]) => void;
};

export function createEditorStateSnapshot(
  input: CreateEditorStateSnapshotInput
): EditorStateSnapshot {
  return {
    v: 1,
    ...input
  };
}

export function restoreEditorStateSnapshot(
  raw: string,
  actions: RestoreEditorStateActions
): boolean {
  try {
    const snapshot = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(snapshot.timelineSegments)) {
      const segments = snapshot.timelineSegments as TimelineSegment[];
      actions.setTimelineSegments(segments);
      for (const segment of segments) {
        actions.addKnownTimelineItemId(segment.itemId);
      }
    }
    if (Array.isArray(snapshot.zoomEffects)) {
      actions.setZoomEffects(snapshot.zoomEffects as ZoomEffect[]);
    }
    if (Array.isArray(snapshot.subtitles)) {
      actions.setSubtitles(snapshot.subtitles as SubtitleSegment[]);
    }
    if (snapshot.subtitleLanguage === null || typeof snapshot.subtitleLanguage === "string") {
      actions.setSubtitleLanguage(snapshot.subtitleLanguage);
    }
    if (snapshot.subtitleStyle) {
      actions.setSubtitleStyle(snapshot.subtitleStyle as SubtitleStyle);
    }
    if (snapshot.layoutMode) {
      actions.setLayoutMode(snapshot.layoutMode as LayoutMode);
    }
    if (snapshot.backgroundStyle) {
      actions.setBackgroundStyle(snapshot.backgroundStyle as BackgroundStyle);
    }
    if (snapshot.activeBackgroundCategory) {
      actions.setActiveBackgroundCategory(
        snapshot.activeBackgroundCategory as BackgroundCategory
      );
    }
    if (typeof snapshot.cameraSize === "number") {
      actions.setCameraSize(snapshot.cameraSize);
    }
    if (snapshot.cameraPosition) {
      actions.setCameraPosition(snapshot.cameraPosition as CameraPosition);
    }
    if (snapshot.cameraShape) {
      actions.setCameraShape(snapshot.cameraShape as CameraShape);
    }
    if (snapshot.cameraBorderStyle) {
      actions.setCameraBorderStyle(snapshot.cameraBorderStyle as CameraBorderStyle);
    }
    if (snapshot.cameraContentTransform) {
      actions.setCameraContentTransform(
        snapshot.cameraContentTransform as CameraContentTransform
      );
    }
    if (snapshot.videoCornerStyle) {
      actions.setVideoCornerStyle(snapshot.videoCornerStyle as VideoCornerStyle);
    }
    if (snapshot.screenPosition) {
      actions.setScreenPosition(snapshot.screenPosition as ScreenPositionState);
    }
    if (snapshot.screenAspectRatio) {
      actions.setScreenAspectRatio(snapshot.screenAspectRatio as ScreenAspectRatio);
    }
    if (snapshot.cameraFrame) {
      actions.setCameraFrame(snapshot.cameraFrame as CameraFrame);
    }
    if (typeof snapshot.masterVolume === "number") {
      actions.setMasterVolume(snapshot.masterVolume);
    }
    if (snapshot.audioLevels && typeof snapshot.audioLevels === "object") {
      actions.setAudioLevels(snapshot.audioLevels as AudioLevelState);
    }

    return true;
  } catch {
    return false;
  }
}
