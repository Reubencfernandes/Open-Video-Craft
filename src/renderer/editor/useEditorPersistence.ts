/**
 * Save/restore of editor state: loads the project and editor.json on mount,
 * restores state, and saves snapshots + imported files back to the project.
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  EditorProjectImportInput,
  EditorProjectStateView,
  ProjectView
} from "../../shared/types";
import { clampCameraContentTransform } from "./camera-content-transform";
import {
  createEditorStateSnapshot,
  restoreEditorStateSnapshot
} from "./editor-state-storage";
import type {
  AudioLevelState,
  ScreenPositionState,
  TrimRange
} from "./editor-state-storage";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
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
  backgroundAudioIds: string[];
  backgroundStyle: BackgroundStyle;
  cameraBorderStyle: CameraBorderStyle;
  cameraContentTransform: CameraContentTransform;
  cameraFrame: CameraFrame;
  cameraPosition: CameraPosition;
  cameraShape: CameraShape;
  cameraSize: number;
  customBackgroundImportId: string | null;
  importedMedia: EditorMediaItem[];
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  layoutMode: LayoutMode;
  masterVolume: number;
  onProjectCreated: (projectId: string) => void;
  project: ProjectView | null;
  projectId: string | null;
  screenAspectRatio: ScreenAspectRatio;
  screenPosition: ScreenPositionState;
  setActiveBackgroundCategory: Dispatch<SetStateAction<BackgroundCategory>>;
  setAudioLevels: Dispatch<SetStateAction<AudioLevelState>>;
  setBackgroundAudioIds: Dispatch<SetStateAction<string[]>>;
  setBackgroundStyle: Dispatch<SetStateAction<BackgroundStyle>>;
  setCameraBorderStyle: Dispatch<SetStateAction<CameraBorderStyle>>;
  setCameraContentTransform: Dispatch<SetStateAction<CameraContentTransform>>;
  setCameraFrame: Dispatch<SetStateAction<CameraFrame>>;
  setCameraPosition: Dispatch<SetStateAction<CameraPosition>>;
  setCameraShape: Dispatch<SetStateAction<CameraShape>>;
  setCameraSize: Dispatch<SetStateAction<number>>;
  setCustomBackgroundImportId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setImportedMedia: Dispatch<SetStateAction<EditorMediaItem[]>>;
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
  setTrimRange: Dispatch<SetStateAction<TrimRange>>;
  setVideoCornerStyle: Dispatch<SetStateAction<VideoCornerStyle>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  subtitleStyle: SubtitleStyle;
  subtitleLanguage: string | null;
  subtitles: SubtitleSegment[];
  timelineSegments: TimelineSegment[];
  trimRange: TrimRange;
  videoCornerStyle: VideoCornerStyle;
  zoomEffects: ZoomEffect[];
};

type RestoreActionParams = {
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  setActiveBackgroundCategory: Dispatch<SetStateAction<BackgroundCategory>>;
  setAudioLevels: Dispatch<SetStateAction<AudioLevelState>>;
  setBackgroundAudioIds: Dispatch<SetStateAction<string[]>>;
  setBackgroundStyle: Dispatch<SetStateAction<BackgroundStyle>>;
  setCameraBorderStyle: Dispatch<SetStateAction<CameraBorderStyle>>;
  setCameraContentTransform: Dispatch<SetStateAction<CameraContentTransform>>;
  setCameraFrame: Dispatch<SetStateAction<CameraFrame>>;
  setCameraPosition: Dispatch<SetStateAction<CameraPosition>>;
  setCameraShape: Dispatch<SetStateAction<CameraShape>>;
  setCameraSize: Dispatch<SetStateAction<number>>;
  setCustomBackgroundImportId: Dispatch<SetStateAction<string | null>>;
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
  setMasterVolume: Dispatch<SetStateAction<number>>;
  setScreenAspectRatio: Dispatch<SetStateAction<ScreenAspectRatio>>;
  setScreenPosition: Dispatch<SetStateAction<ScreenPositionState>>;
  setSpeedEffects: Dispatch<SetStateAction<SpeedEffect[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitleStyle: Dispatch<SetStateAction<SubtitleStyle>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTrimRange: Dispatch<SetStateAction<TrimRange>>;
  setVideoCornerStyle: Dispatch<SetStateAction<VideoCornerStyle>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
};

export function useEditorPersistence(params: UseEditorPersistenceParams) {
  const {
    activeBackgroundCategory,
    audioLevels,
    backgroundAudioIds,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    customBackgroundImportId,
    importedMedia,
    knownTimelineItemIdsRef,
    layoutMode,
    masterVolume,
    onProjectCreated,
    project,
    projectId,
    screenAspectRatio,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setCustomBackgroundImportId,
    setError,
    setExportMessage,
    setImportedMedia,
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
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    subtitleStyle,
    subtitleLanguage,
    subtitles,
    timelineSegments,
    trimRange,
    videoCornerStyle,
    zoomEffects
  } = params;
  const [isReady, setIsReady] = useState(!projectId);
  const [saving, setSaving] = useState(false);
  const saveStateRef = useRef<() => Promise<void>>(async () => undefined);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      setIsReady(true);
      return undefined;
    }

    setIsReady(false);
    void (async () => {
      try {
        const loadedProject = await window.openVideoCraft.projects.get(projectId);
        const savedState = await window.openVideoCraft.editor.loadProjectState(projectId);
        if (cancelled) {
          return;
        }

        setProject(loadedProject);
        if (savedState) {
          applySavedState(savedState, {
            knownTimelineItemIdsRef,
            setActiveBackgroundCategory,
            setAudioLevels,
            setBackgroundAudioIds,
            setBackgroundStyle,
            setCameraBorderStyle,
            setCameraContentTransform,
            setCameraFrame,
            setCameraPosition,
            setCameraShape,
            setCameraSize,
            setCustomBackgroundImportId,
            setImportedMedia,
            setLayoutMode,
            setMasterVolume,
            setScreenAspectRatio,
            setScreenPosition,
            setSpeedEffects,
            setSubtitleLanguage,
            setSubtitleStyle,
            setSubtitles,
            setTimelineSegments,
            setTrimRange,
            setVideoCornerStyle,
            setZoomEffects
          });
        } else {
          // Preserve edits made by pre-1.0.10 builds once, then save them into
          // the project folder the next time the user presses Save.
          const legacyState = localStorage.getItem(`ovc-editor-state:${projectId}`);
          if (legacyState) {
            restoreEditorStateSnapshot(legacyState, createRestoreActions({
              knownTimelineItemIdsRef,
              setActiveBackgroundCategory,
              setAudioLevels,
              setBackgroundAudioIds,
              setBackgroundStyle,
              setCameraBorderStyle,
              setCameraContentTransform,
              setCameraFrame,
              setCameraPosition,
              setCameraShape,
              setCameraSize,
              setCustomBackgroundImportId,
              setLayoutMode,
              setMasterVolume,
              setScreenAspectRatio,
              setScreenPosition,
              setSpeedEffects,
              setSubtitleLanguage,
              setSubtitleStyle,
              setSubtitles,
              setTimelineSegments,
              setTrimRange,
              setVideoCornerStyle,
              setZoomEffects
            }));
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    knownTimelineItemIdsRef,
    projectId,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setCustomBackgroundImportId,
    setError,
    setImportedMedia,
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
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects
  ]);

  const saveState = async () => {
    if (saveInFlightRef.current) {
      return saveInFlightRef.current;
    }

    setSaving(true);
    const operation = (async () => {
      try {
        let activeProject = project;
        if (!activeProject) {
          const name =
            importedMedia.find((item) => item.kind === "video")?.name ?? "Untitled Edit";
          activeProject = await window.openVideoCraft.projects.create({ name });
          setProject(activeProject);
          onProjectCreated(activeProject.id);
        }

        const result = await window.openVideoCraft.editor.saveProjectState({
          projectId: activeProject.id,
          state: createEditorStateSnapshot({
            activeBackgroundCategory,
            audioLevels,
            backgroundAudioIds,
            backgroundStyle,
            cameraBorderStyle,
            cameraContentTransform,
            cameraFrame,
            cameraPosition,
            cameraShape,
            cameraSize,
            customBackgroundImportId,
            layoutMode,
            masterVolume,
            screenAspectRatio,
            screenPosition,
            speedEffects,
            subtitleLanguage,
            subtitleStyle,
            subtitles,
            timelineSegments,
            trimRange,
            videoCornerStyle,
            zoomEffects
          }),
          imports: toEditorProjectImports(importedMedia)
        });

        setImportedMedia(result.imports.map(toEditorMediaItem));
        setError(null);
        setExportMessage("Project saved");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save the project state.");
      } finally {
        setSaving(false);
        saveInFlightRef.current = null;
      }
    })();
    saveInFlightRef.current = operation;
    return operation;
  };
  saveStateRef.current = saveState;

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveStateRef.current();
      }
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);

  return {
    isReady,
    saving,
    saveState
  };
}

function applySavedState(
  savedState: EditorProjectStateView,
  actions: RestoreActionParams & {
    setImportedMedia: Dispatch<SetStateAction<EditorMediaItem[]>>;
  }
): void {
  actions.setImportedMedia(savedState.imports.map(toEditorMediaItem));
  restoreEditorStateSnapshot(savedState.state, createRestoreActions(actions));
}

function createRestoreActions(actions: RestoreActionParams) {
  return {
    addKnownTimelineItemId: (itemId: string) => actions.knownTimelineItemIdsRef.current.add(itemId),
    setActiveBackgroundCategory: actions.setActiveBackgroundCategory,
    setAudioLevels: actions.setAudioLevels,
    setBackgroundAudioIds: actions.setBackgroundAudioIds,
    setBackgroundStyle: actions.setBackgroundStyle,
    setCameraBorderStyle: actions.setCameraBorderStyle,
    setCameraContentTransform: (value: CameraContentTransform) =>
      actions.setCameraContentTransform(clampCameraContentTransform(value)),
    setCameraFrame: actions.setCameraFrame,
    setCameraPosition: actions.setCameraPosition,
    setCameraShape: actions.setCameraShape,
    setCameraSize: actions.setCameraSize,
    setCustomBackgroundImportId: actions.setCustomBackgroundImportId,
    setLayoutMode: actions.setLayoutMode,
    setMasterVolume: actions.setMasterVolume,
    setScreenAspectRatio: actions.setScreenAspectRatio,
    setScreenPosition: actions.setScreenPosition,
    setSpeedEffects: actions.setSpeedEffects,
    setSubtitleLanguage: actions.setSubtitleLanguage,
    setSubtitleStyle: actions.setSubtitleStyle,
    setSubtitles: actions.setSubtitles,
    setTimelineSegments: actions.setTimelineSegments,
    setTrimRange: actions.setTrimRange,
    setVideoCornerStyle: actions.setVideoCornerStyle,
    setZoomEffects: actions.setZoomEffects
  };
}

function toEditorProjectImports(items: EditorMediaItem[]): EditorProjectImportInput[] {
  return items
    .filter((item) => item.origin === "imported" && item.importId)
    .map((item) => ({
      id: item.importId ?? item.id,
      name: item.name,
      kind: item.kind,
      extension: item.extension ?? extensionFromName(item.name),
      duration: item.duration
    }));
}

function toEditorMediaItem(imported: EditorProjectStateView["imports"][number]): EditorMediaItem {
  return {
    id: imported.id,
    name: imported.name,
    url: imported.url,
    kind: imported.kind,
    origin: "imported",
    track: "imported",
    duration: imported.duration,
    importId: imported.id,
    extension: imported.extension
  };
}

function extensionFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!/^[a-z0-9]{1,12}$/.test(extension)) {
    throw new Error(`Imported media "${name}" does not have a supported file extension.`);
  }

  return extension;
}
