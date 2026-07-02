import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateProjectRequest,
  ExportVideoRequest,
  ExportVideoResult,
  FailRecordingRequest,
  FfmpegStatus,
  ImportedMediaFile,
  ProjectView,
  SourceOverlayResult,
  SourceSummary,
  StartRecordingRequest,
  StopRecordingRequest,
  WriteChunkRequest
} from "../shared/types";

const api = {
  sources: {
    list: (): Promise<SourceSummary[]> => ipcRenderer.invoke("sources:list")
  },
  capture: {
    selectDisplaySource: (sourceId: string): Promise<boolean> =>
      ipcRenderer.invoke("capture:select-display-source", sourceId)
  },
  projects: {
    chooseBaseDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke("projects:choose-base-directory"),
    get: (projectId: string): Promise<ProjectView> =>
      ipcRenderer.invoke("projects:get", projectId),
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
    status: (): Promise<FfmpegStatus> => ipcRenderer.invoke("ffmpeg:status"),
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
