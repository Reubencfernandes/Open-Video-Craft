import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProjectView } from "../../shared/types";
import { clampCameraContentTransform } from "./camera-content-transform";
import {
  createEditorStateSnapshot,
  restoreEditorStateSnapshot
} from "./editor-state-storage";
import type {
  AudioLevelState,
  ScreenPositionState
} from "./editor-state-storage";
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

type UseEditorPersistenceParams = {
  activeBackgroundCategory: BackgroundCategory;
  audioLevels: AudioLevelState;
  backgroundStyle: BackgroundStyle;
  cameraBorderStyle: CameraBorderStyle;
  cameraContentTransform: CameraContentTransform;
  cameraFrame: CameraFrame;
  cameraPosition: CameraPosition;
  cameraShape: CameraShape;
  cameraSize: number;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  layoutMode: LayoutMode;
  masterVolume: number;
  projectId: string | null;
  screenAspectRatio: ScreenAspectRatio;
  screenPosition: ScreenPositionState;
  setActiveBackgroundCategory: Dispatch<SetStateAction<BackgroundCategory>>;
  setAudioLevels: Dispatch<SetStateAction<AudioLevelState>>;
  setBackgroundStyle: Dispatch<SetStateAction<BackgroundStyle>>;
  setCameraBorderStyle: Dispatch<SetStateAction<CameraBorderStyle>>;
  setCameraContentTransform: Dispatch<SetStateAction<CameraContentTransform>>;
  setCameraFrame: Dispatch<SetStateAction<CameraFrame>>;
  setCameraPosition: Dispatch<SetStateAction<CameraPosition>>;
  setCameraShape: Dispatch<SetStateAction<CameraShape>>;
  setCameraSize: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
  setMasterVolume: Dispatch<SetStateAction<number>>;
  setProject: Dispatch<SetStateAction<ProjectView | null>>;
  setScreenAspectRatio: Dispatch<SetStateAction<ScreenAspectRatio>>;
  setScreenPosition: Dispatch<SetStateAction<ScreenPositionState>>;
  setSpeedEffects: Dispatch<SetStateAction<SpeedEffect[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitleStyle: Dispatch<SetStateAction<SubtitleStyle>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setVideoCornerStyle: Dispatch<SetStateAction<VideoCornerStyle>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  subtitleStyle: SubtitleStyle;
  subtitleLanguage: string | null;
  subtitles: SubtitleSegment[];
  timelineSegments: TimelineSegment[];
  videoCornerStyle: VideoCornerStyle;
  zoomEffects: ZoomEffect[];
};

export function useEditorPersistence(params: UseEditorPersistenceParams) {
  const {
    activeBackgroundCategory,
    audioLevels,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    knownTimelineItemIdsRef,
    layoutMode,
    masterVolume,
    projectId,
    screenAspectRatio,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setError,
    setExportMessage,
    setLayoutMode,
    setMasterVolume,
    setProject,
    setScreenAspectRatio,
    setScreenPosition,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTimelineSegments,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    subtitleStyle,
    subtitleLanguage,
    subtitles,
    timelineSegments,
    videoCornerStyle,
    zoomEffects
  } = params;
  const saveStateRef = useRef<() => void>(() => undefined);
  const restoredRef = useRef(false);
  const stateStorageKey = projectId ? `ovc-editor-state:${projectId}` : null;

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void window.openVideoCraft.projects
      .get(projectId)
      .then(setProject)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, [projectId, setError, setProject]);

  useEffect(() => {
    if (restoredRef.current || !stateStorageKey) {
      return;
    }
    restoredRef.current = true;

    const raw = localStorage.getItem(stateStorageKey);
    if (!raw) {
      return;
    }

    restoreEditorStateSnapshot(raw, {
      addKnownTimelineItemId: (itemId) => knownTimelineItemIdsRef.current.add(itemId),
      setActiveBackgroundCategory,
      setAudioLevels,
      setBackgroundStyle,
      setCameraBorderStyle,
      setCameraContentTransform: (value) =>
        setCameraContentTransform(clampCameraContentTransform(value)),
      setCameraFrame,
      setCameraPosition,
      setCameraShape,
      setCameraSize,
      setLayoutMode,
      setMasterVolume,
      setScreenAspectRatio,
      setScreenPosition,
      setSpeedEffects,
      setSubtitleLanguage,
      setSubtitleStyle,
      setSubtitles,
      setTimelineSegments,
      setVideoCornerStyle,
      setZoomEffects
    });
  }, [
    knownTimelineItemIdsRef,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setLayoutMode,
    setMasterVolume,
    setScreenAspectRatio,
    setScreenPosition,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTimelineSegments,
    setVideoCornerStyle,
    setZoomEffects,
    stateStorageKey
  ]);

  const saveState = () => {
    if (!stateStorageKey) {
      return;
    }

    const snapshot = createEditorStateSnapshot({
      activeBackgroundCategory,
      audioLevels,
      backgroundStyle,
      cameraBorderStyle,
      cameraContentTransform,
      cameraFrame,
      cameraPosition,
      cameraShape,
      cameraSize,
      layoutMode,
      masterVolume,
      screenAspectRatio,
      screenPosition,
      speedEffects,
      subtitleLanguage,
      subtitleStyle,
      subtitles,
      timelineSegments,
      videoCornerStyle,
      zoomEffects
    });

    try {
      localStorage.setItem(stateStorageKey, JSON.stringify(snapshot));
      setError(null);
      setExportMessage("Project saved");
    } catch {
      setError("Could not save the project state.");
    }
  };
  saveStateRef.current = saveState;

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveStateRef.current();
      }
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);

  return {
    saveState
  };
}
