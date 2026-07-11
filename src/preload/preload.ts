/**
 * Preload script: exposes the typed `window.openVideoCraft` IPC bridge that is
 * the renderer's only path into the main process.
 */
import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfo,
  CreateProjectRequest,
  DesktopPermissionKind,
  DesktopPermissionStatus,
  ExportVideoRequest,
  ExportVideoResult,
  EditorProjectStateView,
  FailRecordingRequest,
  ImportedMediaFile,
  ProjectLibraryEntry,
  ProjectView,
  SaveEditorProjectStateRequest,
  SourceOverlayResult,
  SourceSummary,
  StartRecordingRequest,
  StopRecordingRequest,
  UpdateStatus,
  WriteChunkRequest
} from "../shared/types";

const api = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:get-info")
  },
  updates: {
    getStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:get-status"),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:check"),
    install: (): Promise<boolean> => ipcRenderer.invoke("updates:install"),
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: UpdateStatus) => callback(status);
      ipcRenderer.on("updates:status", listener);
      return () => ipcRenderer.removeListener("updates:status", listener);
    }
  },
  sources: {
    list: (): Promise<SourceSummary[]> => ipcRenderer.invoke("sources:list")
  },
  permissions: {
    getStatus: (): Promise<DesktopPermissionStatus> =>
      ipcRenderer.invoke("permissions:get-status"),
    openSettings: (kind: DesktopPermissionKind): Promise<boolean> =>
      ipcRenderer.invoke("permissions:open-settings", kind),
    showGuide: (kind: DesktopPermissionKind): Promise<boolean> =>
      ipcRenderer.invoke("permissions:show-guide", kind),
    requestMedia: (kind: Extract<DesktopPermissionKind, "camera" | "microphone">): Promise<boolean> =>
      ipcRenderer.invoke("permissions:request-media", kind),
    revealApp: (): Promise<boolean> => ipcRenderer.invoke("permissions:reveal-app"),
    startAppDrag: (): void => ipcRenderer.send("permissions:start-app-drag")
  },
  capture: {
    selectDisplaySource: (sourceId: string): Promise<boolean> =>
      ipcRenderer.invoke("capture:select-display-source", sourceId)
  },
  projects: {
    chooseBaseDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke("projects:choose-base-directory"),
    listRecent: (): Promise<ProjectLibraryEntry[]> =>
      ipcRenderer.invoke("projects:list-recent"),
    get: (projectId: string): Promise<ProjectView> =>
      ipcRenderer.invoke("projects:get", projectId),
    openExistingProjectFolder: (): Promise<ProjectView | null> =>
      ipcRenderer.invoke("projects:open-existing-project-folder"),
    removeFromRecent: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("projects:remove-from-recent", projectId),
    delete: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("projects:delete", projectId),
    discard: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("projects:discard", projectId),
    create: (request: CreateProjectRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("projects:create", request)
  },
  recording: {
    start: (request: StartRecordingRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("recording:start", request),
    writeChunk: (request: WriteChunkRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("recording:write-chunk", request),
    stop: (request: StopRecordingRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("recording:stop", request),
    fail: (request: FailRecordingRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("recording:fail", request)
  },
  ffmpeg: {
    prepareAudio: (projectId: string): Promise<ProjectView> =>
      ipcRenderer.invoke("ffmpeg:prepare-audio", projectId)
  },
  windows: {
    openRecorderController: (): Promise<boolean> =>
      ipcRenderer.invoke("windows:open-recorder-controller"),
    minimizeCurrent: (): Promise<boolean> => ipcRenderer.invoke("windows:minimize-current"),
    closeCurrent: (): Promise<boolean> => ipcRenderer.invoke("windows:close-current"),
    hideCurrent: (): Promise<boolean> => ipcRenderer.invoke("windows:hide-current"),
    showCurrent: (): Promise<boolean> => ipcRenderer.invoke("windows:show-current"),
    setRecorderCompact: (compact: boolean): Promise<boolean> =>
      ipcRenderer.invoke("windows:set-recorder-compact", compact),
    openEditor: (projectId?: string | null): Promise<boolean> =>
      ipcRenderer.invoke("windows:open-editor", projectId),
    openMain: (): Promise<boolean> => ipcRenderer.invoke("windows:open-main")
  },
  editor: {
    importMedia: (): Promise<ImportedMediaFile[]> => ipcRenderer.invoke("editor:import-media"),
    removeImportedMedia: (importId: string): Promise<boolean> =>
      ipcRenderer.invoke("editor:remove-imported-media", importId),
    loadProjectState: (projectId: string): Promise<EditorProjectStateView | null> =>
      ipcRenderer.invoke("editor:load-project-state", projectId),
    saveProjectState: (request: SaveEditorProjectStateRequest): Promise<EditorProjectStateView> =>
      ipcRenderer.invoke("editor:save-project-state", request),
    exportVideo: (request: ExportVideoRequest): Promise<ExportVideoResult | null> =>
      ipcRenderer.invoke("editor:export-video", request)
  },
  overlays: {
    showSourceBorder: (sourceId: string): Promise<SourceOverlayResult> =>
      ipcRenderer.invoke("overlays:show-source-border", sourceId),
    hideSourceBorder: (): Promise<boolean> => ipcRenderer.invoke("overlays:hide-source-border")
  },
  events: {
    onGlobalStop: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("recording:global-stop", listener);
      return () => ipcRenderer.removeListener("recording:global-stop", listener);
    }
  }
};

contextBridge.exposeInMainWorld("openVideoCraft", api);

export type OpenVideoCraftApi = typeof api;
