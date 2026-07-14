/**
 * Save/restore of editor state: loads the project and editor.json on mount,
 * restores state, and saves snapshots + imported files back to the project.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  ClipTransition,
  EditorMediaItem,
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
  pendingProjectName: string;
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
  setTransitions: Dispatch<SetStateAction<ClipTransition[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitleStyle: Dispatch<SetStateAction<SubtitleStyle>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTrimRange: Dispatch<SetStateAction<TrimRange>>;
  setVideoCornerStyle: Dispatch<SetStateAction<VideoCornerStyle>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  transitions: ClipTransition[];
  subtitleStyle: SubtitleStyle;
  subtitleLanguage: string | null;
  subtitles: SubtitleSegment[];
  textOverlays: TextOverlay[];
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
  setTransitions: Dispatch<SetStateAction<ClipTransition[]>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitleStyle: Dispatch<SetStateAction<SubtitleStyle>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTextOverlays: Dispatch<SetStateAction<TextOverlay[]>>;
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
    pendingProjectName,
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
    setTransitions,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTextOverlays,
    setTimelineSegments,
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    transitions,
    subtitleStyle,
    subtitleLanguage,
    subtitles,
    textOverlays,
    timelineSegments,
    trimRange,
    videoCornerStyle,
    zoomEffects
  } = params;
  const [isReady, setIsReady] = useState(!projectId);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastAgentEdit, setLastAgentEdit] = useState<EditorProjectStateView["lastMutation"] | null>(null);
  const revisionRef = useRef(0);
  const saveStateRef = useRef<(silent?: boolean) => Promise<void>>(async () => undefined);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const savedSignatureRef = useRef<string | null>(null);
  const latestSignatureRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  // Set right before an intentional in-app navigation (e.g. "Back to main
  // menu") so the beforeunload guard doesn't cancel it. Electron silently
  // aborts a main-process loadURL when beforeunload prevents the unload, which
  // is why blocking here would make the Home button appear to do nothing.
  const allowUnloadRef = useRef(false);
  const notifySession = (dirty: boolean) => {
    if (projectId) {
      void window.openVideoCraft.editor.setSessionState({ projectId, dirty }).catch(() => undefined);
    }
  };

  useEffect(() => {
    let cancelled = false;
    savedSignatureRef.current = null;
    dirtyRef.current = false;
    revisionRef.current = 0;
    setRevision(0);
    setLastAgentEdit(null);

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
        notifySession(false);
        if (savedState) {
          revisionRef.current = savedState.revision;
          setRevision(savedState.revision);
          setLastAgentEdit(savedState.lastMutation.source === "agent" ? savedState.lastMutation : null);
          const restored = applySavedState(savedState, {
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
            setTransitions,
            setSubtitleLanguage,
            setSubtitleStyle,
            setSubtitles,
            setTextOverlays,
            setTimelineSegments,
            setTrimRange,
            setVideoCornerStyle,
            setZoomEffects
          });
          if (!restored) {
            setError("This project's editor state is invalid or from an unsupported version. Safe defaults were loaded instead.");
          }
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
              setTransitions,
              setSubtitleLanguage,
              setSubtitleStyle,
              setSubtitles,
              setTextOverlays,
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
    setTransitions,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTextOverlays,
    setTimelineSegments,
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects
  ]);

  // Playback ticks `currentTime` at 30–60 Hz, re-rendering this hook each time.
  // None of the snapshot inputs change during playback, so memoize the snapshot
  // and its JSON signature on the actual state values — otherwise every tick
  // rebuilt and stringified the whole project (tens of KB) for nothing.
  const snapshot = useMemo(
    () =>
      createEditorStateSnapshot({
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
        transitions,
        subtitleLanguage,
        subtitleStyle,
        subtitles,
        textOverlays,
        timelineSegments,
        trimRange,
        videoCornerStyle,
        zoomEffects
      }),
    [
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
      transitions,
      subtitleLanguage,
      subtitleStyle,
      subtitles,
      textOverlays,
      timelineSegments,
      trimRange,
      videoCornerStyle,
      zoomEffects
    ]
  );
  const persistenceSignature = useMemo(
    () =>
      JSON.stringify({
        snapshot,
        imports: toEditorProjectImports(importedMedia)
      }),
    [snapshot, importedMedia]
  );
  latestSignatureRef.current = persistenceSignature;

  const saveState = async (silent = false) => {
    if (saveInFlightRef.current) {
      return saveInFlightRef.current;
    }

    const signatureBeingSaved = persistenceSignature;
    const snapshotBeingSaved = snapshot;
    const importsBeingSaved = toEditorProjectImports(importedMedia);
    setSaving(true);
    const operation = (async () => {
      let saved = false;
      try {
        let activeProject = project;
        if (!activeProject) {
          // Creating the first project prompts for a save folder via a native
          // dialog. Never interrupt a background autosave with that dialog:
          // leave the edit dirty and let it persist on the next explicit save
          // (the Save button or Ctrl/Cmd+S) once the user chooses a folder.
          if (silent) {
            return;
          }
          const name =
            pendingProjectName.trim() ||
            importedMedia.find((item) => item.kind === "video")?.name ||
            "Untitled Edit";
          activeProject = await window.openVideoCraft.projects.create({ name });
          setProject(activeProject);
          onProjectCreated(activeProject.id);
        }

        const result = await window.openVideoCraft.editor.saveProjectState({
          projectId: activeProject.id,
          baseRevision: revisionRef.current,
          state: snapshotBeingSaved,
          imports: importsBeingSaved
        });

        revisionRef.current = result.revision;
        setRevision(result.revision);
        setLastAgentEdit(result.lastMutation.source === "agent" ? result.lastMutation : null);
        setImportedMedia(result.imports.map(toEditorMediaItem));
        notifySession(false);
        savedSignatureRef.current = signatureBeingSaved;
        dirtyRef.current = latestSignatureRef.current !== signatureBeingSaved;
        saved = true;
        setError(null);
        if (!silent) {
          setExportMessage("Project saved");
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save the project state.");
      } finally {
        setSaving(false);
        saveInFlightRef.current = null;
        if (saved && dirtyRef.current) {
          window.setTimeout(() => void saveStateRef.current(true), 100);
        }
      }
    })();
    saveInFlightRef.current = operation;
    return operation;
  };
  saveStateRef.current = saveState;

  useEffect(() => {
    if (!isReady) return undefined;
    if (savedSignatureRef.current === null) {
      savedSignatureRef.current = persistenceSignature;
      dirtyRef.current = false;
      return undefined;
    }

    dirtyRef.current = savedSignatureRef.current !== persistenceSignature;
    notifySession(dirtyRef.current);
    if (!dirtyRef.current) return undefined;

    const timer = window.setTimeout(() => {
      void saveStateRef.current(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [isReady, persistenceSignature]);

  useEffect(() => {
    if (!projectId || !isReady) return undefined;
    const refresh = window.setInterval(() => notifySession(dirtyRef.current), 5_000);
    return () => {
      window.clearInterval(refresh);
      void window.openVideoCraft.editor.setSessionState({ projectId, dirty: false }).catch(() => undefined);
    };
  // projectId/isReady own the session lifecycle; notifySession reads refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isReady]);

  useEffect(() => {
    if (!projectId) return undefined;
    return window.openVideoCraft.editor.onProjectStateChanged((external) => {
      if (external.revision <= revisionRef.current) return;
      if (dirtyRef.current) {
        setError("An AI edit arrived while this project had unsaved local changes. Save or reload before applying more AI edits.");
        return;
      }
      const restored = applySavedState(external, {
        knownTimelineItemIdsRef,
        setActiveBackgroundCategory, setAudioLevels, setBackgroundAudioIds, setBackgroundStyle,
        setCameraBorderStyle, setCameraContentTransform, setCameraFrame, setCameraPosition,
        setCameraShape, setCameraSize, setCustomBackgroundImportId, setImportedMedia, setLayoutMode,
        setMasterVolume, setScreenAspectRatio, setScreenPosition, setSpeedEffects, setTransitions,
        setSubtitleLanguage, setSubtitleStyle, setSubtitles, setTextOverlays, setTimelineSegments, setTrimRange,
        setVideoCornerStyle, setZoomEffects
      });
      if (!restored) {
        setError("The external AI edit produced an unsupported editor state.");
        return;
      }
      revisionRef.current = external.revision;
      setRevision(external.revision);
      setLastAgentEdit(external.lastMutation.source === "agent" ? external.lastMutation : null);
      const externalItems = external.imports.map(toEditorMediaItem);
      savedSignatureRef.current = JSON.stringify({ snapshot: external.state, imports: toEditorProjectImports(externalItems) });
      dirtyRef.current = false;
      notifySession(false);
      if (external.lastMutation.summary) setExportMessage(external.lastMutation.summary);
    });
  }, [
    knownTimelineItemIdsRef, projectId, setActiveBackgroundCategory, setAudioLevels,
    setBackgroundAudioIds, setBackgroundStyle, setCameraBorderStyle, setCameraContentTransform,
    setCameraFrame, setCameraPosition, setCameraShape, setCameraSize, setCustomBackgroundImportId,
    setError, setExportMessage, setImportedMedia, setLayoutMode, setMasterVolume,
    setScreenAspectRatio, setScreenPosition, setSpeedEffects, setTransitions, setSubtitleLanguage,
    setSubtitleStyle, setSubtitles, setTimelineSegments, setTrimRange, setVideoCornerStyle,
    setTextOverlays,
    setZoomEffects
  ]);

  const undoLastAgentEdit = async () => {
    if (!projectId || !lastAgentEdit?.editId) return;
    const restored = await window.openVideoCraft.editor.undoAgentEdit({
      projectId, baseRevision: revisionRef.current, editId: lastAgentEdit.editId
    });
    if (!applySavedState(restored, {
      knownTimelineItemIdsRef,
      setActiveBackgroundCategory, setAudioLevels, setBackgroundAudioIds, setBackgroundStyle,
      setCameraBorderStyle, setCameraContentTransform, setCameraFrame, setCameraPosition,
      setCameraShape, setCameraSize, setCustomBackgroundImportId, setImportedMedia, setLayoutMode,
      setMasterVolume, setScreenAspectRatio, setScreenPosition, setSpeedEffects, setTransitions,
      setSubtitleLanguage, setSubtitleStyle, setSubtitles, setTimelineSegments, setTrimRange,
      setTextOverlays,
      setVideoCornerStyle, setZoomEffects
    })) throw new Error("The AI checkpoint could not be restored.");
    revisionRef.current = restored.revision;
    setRevision(restored.revision);
    setLastAgentEdit(null);
    dirtyRef.current = false;
    setExportMessage("AI edit undone");
  };

  useEffect(() => {
    function guardUnsavedChanges(event: BeforeUnloadEvent) {
      if (allowUnloadRef.current || !dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guardUnsavedChanges);
    return () => window.removeEventListener("beforeunload", guardUnsavedChanges);
  }, []);

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
    allowUnload: () => {
      allowUnloadRef.current = true;
    },
    hasUnsavedChanges: () => dirtyRef.current,
    isReady,
    lastAgentEdit,
    revision,
    saving,
    saveState,
    undoLastAgentEdit
  };
}

function applySavedState(
  savedState: EditorProjectStateView,
  actions: RestoreActionParams & {
    setImportedMedia: Dispatch<SetStateAction<EditorMediaItem[]>>;
  }
): boolean {
  actions.setImportedMedia(savedState.imports.map(toEditorMediaItem));
  return restoreEditorStateSnapshot(savedState.state, createRestoreActions(actions));
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
    setTransitions: actions.setTransitions,
    setSubtitleLanguage: actions.setSubtitleLanguage,
    setSubtitleStyle: actions.setSubtitleStyle,
    setSubtitles: actions.setSubtitles,
    setTextOverlays: actions.setTextOverlays,
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
