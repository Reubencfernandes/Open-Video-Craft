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
  ClipTransition,
  LayoutMode,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  TextOverlay,
  TimelineSegment,
  VideoCornerStyle,
  ZoomEffect
} from "./types";
import {
  validateEditorStateSnapshot
} from "../../shared/editor-domain";
import type {
  AudioLevelState,
  EditorStateSnapshot,
  PendingMediaImport,
  PendingMusicGeneration,
  PreviewQuality,
  ScreenPositionState,
  TrimRange
} from "../../shared/editor-domain";

export type {
  AudioLevelState,
  EditorStateSnapshot,
  PendingMediaImport,
  PendingMusicGeneration,
  PreviewQuality,
  ScreenPositionState,
  TrimRange
} from "../../shared/editor-domain";

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
  setPendingMediaImport: (value: PendingMediaImport | null) => void;
  setPendingMusicGeneration: (value: PendingMusicGeneration | null) => void;
  setPreviewQuality: (value: PreviewQuality) => void;
  setPreviewZoom: (value: number) => void;
  setScreenAspectRatio: (value: ScreenAspectRatio) => void;
  setScreenPosition: (value: ScreenPositionState) => void;
  setSpeedEffects: (value: SpeedEffect[]) => void;
  setTransitions: (value: ClipTransition[]) => void;
  setSubtitleLanguage: (value: string | null) => void;
  setSubtitleStyle: (value: SubtitleStyle) => void;
  setSubtitles: (value: SubtitleSegment[]) => void;
  setTextOverlays: (value: TextOverlay[]) => void;
  setTimelineSegments: (value: TimelineSegment[]) => void;
  setTimelineZoom: (value: number) => void;
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
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!validateEditorStateSnapshot(snapshot)) {
      return false;
    }

    actions.setTimelineSegments(snapshot.timelineSegments);
    if (snapshot.timelineZoom !== undefined) {
      actions.setTimelineZoom(snapshot.timelineZoom);
    }
    for (const segment of snapshot.timelineSegments) {
      actions.addKnownTimelineItemId(segment.itemId);
    }
    actions.setZoomEffects(snapshot.zoomEffects);
    actions.setSpeedEffects(snapshot.speedEffects);
    actions.setTransitions(snapshot.transitions ?? []);
    actions.setSubtitles(snapshot.subtitles);
    actions.setTextOverlays(snapshot.textOverlays ?? []);
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
    actions.setPendingMediaImport(snapshot.pendingMediaImport ?? null);
    actions.setPendingMusicGeneration(snapshot.pendingMusicGeneration ?? null);
    if (snapshot.previewQuality !== undefined) {
      actions.setPreviewQuality(snapshot.previewQuality);
    }
    if (snapshot.previewZoom !== undefined) {
      actions.setPreviewZoom(snapshot.previewZoom);
    }
    actions.setAudioLevels(snapshot.audioLevels);
    actions.setBackgroundAudioIds(snapshot.backgroundAudioIds);
    actions.setCustomBackgroundImportId(snapshot.customBackgroundImportId);
    actions.setTrimRange(snapshot.trimRange);

    return true;
  } catch {
    return false;
  }
}
