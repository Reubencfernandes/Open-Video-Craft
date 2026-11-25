/**
 * Preload script: exposes the typed `window.openVideoCraft` IPC bridge that is
 * the renderer's only path into the main process.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AiConnectionStatus,
  AiProvider,
  ClaudeChatRequest,
  ClaudeChatResult,
  AppInfo,
  AudioCleanupPreviewRequest,
  MicTranscriptionRequest,
  ImportRecordedClipRequest,
  MicTranscriptionResult,
  AudioCleanupPreviewResult,
  BenchSnapshot,
  ConfigureAiProviderRequest,
  CreateProjectRequest,
  DesktopPermissionKind,
  DesktopPermissionStatus,
  ExportVideoRequest,
  ExportVideoResult,
  ExportProgress,
  EditorProjectStateView,
  EditorSessionStateRequest,
  FailRecordingRequest,
  GeminiChatMessage,
  GeminiChatSendRequest,
  GeminiChatUpdateEvent,
  ImportedMediaFile,
  MusicGenerateProgressEvent,
  MusicGenerateRequest,
  MusicGenerateResult,
  MatrixPopupRequest,
  ProjectLibraryEntry,
  ProjectView,
  ProviderKeyId,
  ProviderKeysView,
  RenameProjectRequest,
  SaveEditorProjectStateRequest,
  SourceOverlayResult,
  SourceSummary,
  StartRecordingRequest,
  StopRecordingRequest,
  SttProgressEvent,
  SttTranscribeRequest,
  SttTranscribeResult,
  UpdateProviderKeysRequest,
  UpdateStatus,
  UndoAgentEditRequest,
  WriteChunkRequest
} from "../shared/types";
import type { ClickCaptureResult } from "../main/click-capture";
import type { BackgroundRemovalStatus } from "../shared/types";
import type { RecorderSettings } from "../shared/recorder-settings";

function subscribe<Payload>(channel: string) {
  return (callback: (payload: Payload) => void): (() => void) => {
    const listener = (_event: unknown, payload: Payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

// Drag/drop paths are granted only when Electron resolves a real File object.
// The renderer cannot register an arbitrary absolute path by calling the IPC
// method directly; each grant is single-use and consumed by importMediaPaths.
const grantedDroppedMediaPaths = new Set<string>();

const api = {
  ai: {
    getStatus: (): Promise<AiConnectionStatus> => ipcRenderer.invoke("ai:get-status"),
    configure: (request: ConfigureAiProviderRequest): Promise<AiConnectionStatus> =>
      ipcRenderer.invoke("ai:configure", request),
    disconnect: (provider: AiProvider): Promise<AiConnectionStatus> =>
      ipcRenderer.invoke("ai:disconnect", provider)
  },
  audio: {
    transcribeMic: (request: MicTranscriptionRequest): Promise<MicTranscriptionResult> =>
      ipcRenderer.invoke("audio:transcribe-mic", request),
    prepareCleanup: (request: AudioCleanupPreviewRequest): Promise<AudioCleanupPreviewResult> =>
      ipcRenderer.invoke("audio:prepare-cleanup", request)
  },
  claude: {
    send: (request: ClaudeChatRequest): Promise<ClaudeChatResult> =>
      ipcRenderer.invoke("claude:chat", request),
    cancel: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("claude:cancel", projectId)
  },
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:get-info"),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("app:open-external", url)
  },
  popups: {
    show: (request: MatrixPopupRequest): Promise<boolean> =>
      ipcRenderer.invoke("popups:show", request),
    onShow: subscribe<MatrixPopupRequest>("popups:show-request"),
    clear: (): Promise<boolean> => ipcRenderer.invoke("popups:clear"),
    onClear: subscribe<null>("popups:clear-request")
  },
  providers: {
    get: (): Promise<ProviderKeysView> => ipcRenderer.invoke("providers:get"),
    reveal: (provider: ProviderKeyId): Promise<string | null> =>
      ipcRenderer.invoke("providers:reveal", provider),
    update: (request: UpdateProviderKeysRequest): Promise<ProviderKeysView> =>
      ipcRenderer.invoke("providers:update", request)
  },
  stt: {
    transcribe: (request: SttTranscribeRequest): Promise<SttTranscribeResult> =>
      ipcRenderer.invoke("stt:transcribe", request),
    cancel: (requestId: string): Promise<boolean> => ipcRenderer.invoke("stt:cancel", requestId),
    onProgress: subscribe<SttProgressEvent>("stt:progress")
  },
  music: {
    generate: (request: MusicGenerateRequest): Promise<MusicGenerateResult> =>
      ipcRenderer.invoke("music:generate", request),
    cancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke("music:cancel", jobId),
    onGenerateProgress: subscribe<MusicGenerateProgressEvent>("music:generate-progress")
  },
  gemini: {
    send: (request: GeminiChatSendRequest): Promise<GeminiChatMessage[]> =>
      ipcRenderer.invoke("gemini:chat-send", request),
    cancel: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("gemini:chat-cancel", projectId),
    reset: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("gemini:chat-reset", projectId),
    getHistory: (projectId: string): Promise<GeminiChatMessage[]> =>
      ipcRenderer.invoke("gemini:chat-history", projectId),
    onUpdate: subscribe<GeminiChatUpdateEvent>("gemini:chat-update")
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
    list: (): Promise<SourceSummary[]> => ipcRenderer.invoke("sources:list"),
    thumbnail: (sourceId: string): Promise<string | null> =>
      ipcRenderer.invoke("sources:thumbnail", sourceId),
    /** Real still previews for many sources, used by the multi-source grid. */
    thumbnails: (sourceIds: string[]): Promise<Record<string, string>> =>
      ipcRenderer.invoke("sources:thumbnails", sourceIds)
  },
  background: {
    prepare: (projectId: string): Promise<BackgroundRemovalStatus> =>
      ipcRenderer.invoke("background:prepare", projectId),
    status: (projectId: string): Promise<BackgroundRemovalStatus> =>
      ipcRenderer.invoke("background:status", projectId),
    cancel: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("background:cancel", projectId),
    matteUrl: (projectId: string): Promise<string | null> =>
      ipcRenderer.invoke("background:matte-url", projectId),
    onProgress: subscribe<BackgroundRemovalStatus>("background:progress")
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
      ipcRenderer.invoke("capture:select-display-source", sourceId),
    /** Release a reservation whose getDisplayMedia call never consumed it. */
    releaseDisplaySource: (): Promise<boolean> =>
      ipcRenderer.invoke("capture:release-display-source"),
    /** Global clicks recorded next to a project, for automatic zooms. */
    clicks: (projectId: string): Promise<ClickCaptureResult> =>
      ipcRenderer.invoke("capture:clicks", projectId)
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
      ipcRenderer.invoke("projects:create", request),
    rename: (request: RenameProjectRequest): Promise<ProjectView> =>
      ipcRenderer.invoke("projects:rename", request)
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
  recorder: {
    /** App-level source/quality preferences; null means a genuine first run. */
    getSettings: (): Promise<RecorderSettings | null> =>
      ipcRenderer.invoke("recorder:get-settings"),
    saveSettings: (settings: RecorderSettings): Promise<RecorderSettings> =>
      ipcRenderer.invoke("recorder:save-settings", settings)
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
    setRecorderSize: (width: number, height: number): Promise<boolean> =>
      ipcRenderer.invoke("windows:set-recorder-size", width, height),
    openEditor: (projectId?: string | null, options?: { autoAnalyze?: boolean }): Promise<boolean> =>
      ipcRenderer.invoke("windows:open-editor", projectId, options),
    openMain: (): Promise<boolean> => ipcRenderer.invoke("windows:open-main")
  },
  editor: {
    importRecordedClip: (request: ImportRecordedClipRequest): Promise<ImportedMediaFile[]> =>
      ipcRenderer.invoke("editor:import-recorded-clip", request),
    importMedia: (): Promise<ImportedMediaFile[]> => ipcRenderer.invoke("editor:import-media"),
    importMediaPaths: (filePaths: string[]): Promise<ImportedMediaFile[]> => {
      const grantedPaths = filePaths.filter((filePath) => {
        const granted = grantedDroppedMediaPaths.has(filePath);
        if (granted) grantedDroppedMediaPaths.delete(filePath);
        return granted;
      });
      return ipcRenderer.invoke("editor:import-media-paths", grantedPaths);
    },
    // Resolve an OS drag-and-dropped File to its absolute path (File.path was
    // removed in modern Electron, so the renderer must ask the preload bridge).
    getPathForFile: (file: File): string => {
      const filePath = webUtils.getPathForFile(file);
      if (filePath) grantedDroppedMediaPaths.add(filePath);
      return filePath;
    },
    removeImportedMedia: (importId: string): Promise<boolean> =>
      ipcRenderer.invoke("editor:remove-imported-media", importId),
    loadProjectState: (projectId: string): Promise<EditorProjectStateView | null> =>
      ipcRenderer.invoke("editor:load-project-state", projectId),
    saveProjectState: (request: SaveEditorProjectStateRequest): Promise<EditorProjectStateView> =>
      ipcRenderer.invoke("editor:save-project-state", request),
    setSessionState: (request: EditorSessionStateRequest): Promise<boolean> =>
      ipcRenderer.invoke("editor:set-session-state", request),
    undoAgentEdit: (request: UndoAgentEditRequest): Promise<EditorProjectStateView> =>
      ipcRenderer.invoke("editor:undo-agent-edit", request),
    onProjectStateChanged: (callback: (state: EditorProjectStateView) => void): (() => void) => {
      const listener = (_event: unknown, state: EditorProjectStateView) => callback(state);
      ipcRenderer.on("editor:project-state-changed", listener);
      return () => ipcRenderer.removeListener("editor:project-state-changed", listener);
    },
    onFlushRequest: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("editor:flush-request", listener);
      return () => ipcRenderer.removeListener("editor:flush-request", listener);
    },
    exportVideo: (request: ExportVideoRequest): Promise<ExportVideoResult | null> =>
      ipcRenderer.invoke("editor:export-video", request),
    cancelExport: (jobId: string): Promise<boolean> =>
      ipcRenderer.invoke("editor:cancel-export", jobId),
    onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
      const listener = (_event: unknown, progress: ExportProgress) => callback(progress);
      ipcRenderer.on("editor:export-progress", listener);
      return () => ipcRenderer.removeListener("editor:export-progress", listener);
    }
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
    },
    onPowerSuspend: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("recording:power-suspend", listener);
      return () => ipcRenderer.removeListener("recording:power-suspend", listener);
    },
    onPowerResume: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("recording:power-resume", listener);
      return () => ipcRenderer.removeListener("recording:power-resume", listener);
    }
  }
};

contextBridge.exposeInMainWorld("openVideoCraft", api);

if (process.env.OVC_BENCH_MODE === "1") {
  contextBridge.exposeInMainWorld("ovcBench", {
    snapshot: (): Promise<BenchSnapshot> => ipcRenderer.invoke("bench:snapshot")
  });
}

export type OpenVideoCraftApi = typeof api;
