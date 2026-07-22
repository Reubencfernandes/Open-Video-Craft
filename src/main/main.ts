/**
 * Main-process bootstrap and orchestrator: creates the app windows (main,
 * floating recorder, editor, permission guide, recording-border overlay),
 * registers every IPC handler, and wires the focused modules together.
 */
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  powerMonitor,
  protocol,
  safeStorage,
  screen as electronScreen,
  shell,
} from "electron";
import { promises as fs, watch as watchFs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configureAppIdentity, getAppIconPath } from "./app-shell";
import { AiConnectionManager } from "./ai-connection";
import { registerAppStatusIpc } from "./app-status-ipc";
import { getProductVersion } from "./app-version";
import { startAutoUpdates } from "./auto-updates";
import { shouldEnableDevTools } from "./dev-tools";
import {
  assertDesktopPermissionKind,
  assertMediaPermissionKind,
  getDesktopPermissionStatus,
  openPermissionSettings,
  registerPermissionRequestHandlers,
  revealAppBundleInFinder,
  requestMediaPermission,
  startAppBundleDrag
} from "./desktop-permissions";
import { createFallbackThumbnail, listDesktopCapturerSources } from "./desktop-sources";
import {
  getDisplayOverlayStripBounds,
  resolveDisplayForOverlay
} from "./display-overlay";
import {
  chooseBaseDirectory as showBaseDirectoryDialog,
  chooseExistingProjectFolder as showExistingProjectFolderDialog,
  importMediaFiles as showImportMediaDialog,
  importMediaFromPaths
} from "./file-dialogs";
import {
  convertWebmAudioToWav,
  killActiveFfmpegProcesses,
  probeMediaDurationMs,
  remuxWebm
} from "./ffmpeg";
import { exportEditorVideo } from "./editor-export";
import { ExportJobRegistry } from "./export-jobs";
import { GeminiAgentManager } from "./gemini-agent";
import { MusicGenerationManager } from "./music-generation";
import { generateLyria } from "./music-lyria";
import { ProviderKeysManager } from "./provider-keys";
import {
  assertExportVideoRequest,
  assertGeminiChatSendRequest,
  assertMusicGenerateRequest,
  assertProviderKeyId,
  assertSaveEditorProjectStateRequest,
  assertStartRecordingRequest,
  assertSttTranscribeRequest,
  assertUpdateProviderKeysRequest
} from "./request-validation";
import { killActiveSttProcesses, transcribeCloud } from "./stt-cloud";
import { registerMediaProtocol as registerCustomMediaProtocol } from "./media-protocols";
import { ProjectLibrary } from "./project-library";
import { assertProjectDeletionTarget } from "./project-deletion";
import { setEditorSessionState, undoAgentEdit } from "./editor-document-store";
import { writeJsonFileAtomic } from "./project-file";
import { createMediaUrl, ProjectStore } from "./project-store";
import {
  isMacAppStoreBuild,
  SecurityScopedResourceManager
} from "./security-scoped-resources";
import type {
  AiConnectionStatus,
  AiProvider,
  ConfigureAiProviderRequest,
  CreateProjectRequest,
  DesktopPermissionStatus,
  EditorProjectStateFile,
  EditorProjectStateView,
  EditorSessionStateRequest,
  ExportVideoRequest,
  ExportVideoResult,
  FailRecordingRequest,
  GeminiChatMessage,
  GeminiChatSendRequest,
  ImportedMediaFile,
  MusicGenerateProgressEvent,
  MusicGenerateRequest,
  MusicGenerateResult,
  MusicSetupStatus,
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
  SttTranscribeRequest,
  SttTranscribeResult,
  UndoAgentEditRequest,
  UpdateProviderKeysRequest,
  WriteChunkRequest
} from "../shared/types";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "ovc-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      // Thumbnail capture opts into CORS before drawing a video frame to a
      // canvas. Chromium rejects cross-origin custom schemes before our
      // protocol handler runs unless the scheme itself is CORS-enabled.
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: "ovc-import",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const projectStore = new ProjectStore({
  appVersion: getProductVersion()
});

const sourceCache = new Map<string, Electron.DesktopCapturerSource>();
const importedMediaCache = new Map<string, string>();
const exportJobs = new ExportJobRegistry();
// Base directories the user explicitly granted through the folder picker. A
// project can only be created under one of these, so a compromised renderer
// can't smuggle an arbitrary write path into projects:create.
const grantedBaseDirectories = new Set<string>();
// A recording chunk should be a few MB at most; cap it so a renderer bug can't
// balloon main-process memory with one oversized message.
const maxRecordingChunkBytes = 256 * 1024 * 1024;
let selectedDisplaySource: Electron.DesktopCapturerSource | null = null;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let activeRecordingProjectId: string | null = null;
let displayOverlayWindows: BrowserWindow[] = [];
let activeDisplayOverlaySourceId: string | null = null;
let activeDisplayOverlayDisplayId: string | null = null;
let permissionGuideWindow: BrowserWindow | null = null;
let projectLibrary: ProjectLibrary | null = null;
let securityScopedResources: SecurityScopedResourceManager | null = null;
let aiConnectionManager: AiConnectionManager | null = null;
let providerKeysManager: ProviderKeysManager | null = null;
let musicGenerationManager: MusicGenerationManager | null = null;
let geminiAgentManager: GeminiAgentManager | null = null;
const sttJobs = new Map<string, AbortController>();
const lyriaJobs = new Map<string, AbortController>();
let editorStateWatcher: ReturnType<typeof watchFs> | null = null;
let editorStateWatchTimer: NodeJS.Timeout | null = null;
let watchedEditorProjectId: string | null = null;
let recorderCloseTimeout: NodeJS.Timeout | null = null;
let recorderCloseRequested = false;
const recorderRestoreHandlers = new WeakMap<BrowserWindow, () => void>();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

const displayOverlayStripColor = "#34d399";
// Slightly translucent so the Windows border can be seen through.
const displayOverlayBorderColor = "rgba(52, 211, 153, 0.55)";

const recorderWindowSize = {
  expanded: {
    width: 460,
    height: 560
  },
  compact: {
    width: 340,
    height: 86
  }
};

function getProjectLibrary(): ProjectLibrary {
  projectLibrary ??= new ProjectLibrary(path.join(app.getPath("userData"), "projects.json"));
  return projectLibrary;
}

function getSecurityScopedResources(): SecurityScopedResourceManager {
  securityScopedResources ??= new SecurityScopedResourceManager(
    path.join(app.getPath("userData"), "security-scoped-bookmarks.json")
  );
  return securityScopedResources;
}

function getProviderKeysManager(): ProviderKeysManager {
  providerKeysManager ??= new ProviderKeysManager({
    userDataPath: app.getPath("userData"),
    safeStorage
  });
  return providerKeysManager;
}

/**
 * Resolves an ovc-media:// / ovc-import:// URL through the same trusted
 * lookups the media protocols use. Never accepts raw filesystem paths.
 */
function resolveMediaUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parsed.protocol === "ovc-import:" && parsed.hostname === "file") {
      return segments[0] ? importedMediaCache.get(segments[0]) ?? null : null;
    }
    if (parsed.protocol === "ovc-media:" && parsed.hostname === "project") {
      const [projectId, ...relativePathSegments] = segments;
      if (!projectId || relativePathSegments.length === 0) return null;
      return projectStore.resolveProjectFile(projectId, relativePathSegments.join(path.sep));
    }
    return null;
  } catch {
    return null;
  }
}

function getGeminiAgentManager(): GeminiAgentManager {
  geminiAgentManager ??= new GeminiAgentManager({
    userDataPath: app.getPath("userData"),
    getApiKey: () => getProviderKeysManager().getGeminiKey(),
    onUpdate: (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("gemini:chat-update", event);
      }
    },
    requestEditorFlush: () => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("editor:flush-request");
      }
    }
  });
  return geminiAgentManager;
}

function getMusicGenerationManager(): MusicGenerationManager {
  musicGenerationManager ??= new MusicGenerationManager({
    userDataPath: app.getPath("userData"),
    wrapperScriptPath: app.isPackaged
      ? path.join(process.resourcesPath, "acestep_generate.py")
      : path.join(app.getAppPath(), "resources", "acestep_generate.py")
  });
  return musicGenerationManager;
}

function getAiConnectionManager(): AiConnectionManager {
  aiConnectionManager ??= new AiConnectionManager({
    userDataPath: app.getPath("userData"),
    electronExecutable: process.execPath,
    serverEntrypoint: path.join(__dirname, "../mcp/server.js")
  });
  return aiConnectionManager;
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    title: "Open Video Craft",
    icon: getAppIconPath(),
    backgroundColor: "#121317",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopEditorStateWatcher();
    void closeDisplayOverlay();
    closePermissionGuideWindow();
  });
  // The editor renderer guards navigation with `beforeunload` when it has
  // unsaved changes. Without this handler Electron silently aborts the
  // navigation (e.g. "Back to main menu" appears to do nothing); here we turn
  // it into a real confirmation so the user can choose to leave.
  attachUnsavedChangesGuard(mainWindow);
  attachDevToolsShortcuts(mainWindow);

  await loadRendererView(mainWindow, "main");
}

function attachUnsavedChangesGuard(window: BrowserWindow): void {
  window.webContents.on("will-prevent-unload", (event) => {
    if (window.isDestroyed()) {
      return;
    }
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["Leave", "Stay"],
      defaultId: 0,
      cancelId: 1,
      title: "Leave the editor?",
      message: "You have unsaved changes.",
      detail: "If you leave now, your most recent edits won't be saved."
    });
    // Calling preventDefault() here overrides the renderer's beforeunload and
    // lets the navigation/close proceed.
    if (choice === 0) {
      event.preventDefault();
    }
  });
}

async function createRecorderWindow(): Promise<void> {
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.show();
    recorderWindow.focus();
    return;
  }

  recorderWindow = new BrowserWindow({
    width: recorderWindowSize.expanded.width,
    height: recorderWindowSize.expanded.height,
    frame: false,
    resizable: false,
    transparent: true,
    // A transparent window in native fullscreen renders as a broken opaque
    // surface (macOS especially), and this window floats above everything —
    // fullscreen must be impossible. Opening the recorder from a fullscreen
    // launcher Space or a window-tiling shortcut could otherwise trigger it.
    fullscreenable: false,
    fullscreen: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Created hidden and revealed on `ready-to-show`, so the transparent window
    // never flashes empty while the recorder UI paints — it appears fully drawn.
    show: false,
    title: "Open Video Craft Recorder",
    icon: getAppIconPath(),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  recorderWindow.setAlwaysOnTop(true, "screen-saver");
  recorderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Belt and braces: if the OS still forces the window into fullscreen or a
  // maximize despite the flags above, bounce straight back to the floating
  // size instead of leaving a glitched transparent surface over the screen.
  recorderWindow.on("enter-full-screen", () => {
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.setFullScreen(false);
      recorderWindow.setSize(recorderWindowSize.expanded.width, recorderWindowSize.expanded.height);
    }
  });
  recorderWindow.on("maximize", () => {
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.unmaximize();
      recorderWindow.setSize(recorderWindowSize.expanded.width, recorderWindowSize.expanded.height);
    }
  });
  recorderWindow.once("ready-to-show", () => {
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.show();
      recorderWindow.focus();
    }
  });
  recorderWindow.on("close", (event) => {
    if (activeRecordingProjectId) {
      event.preventDefault();
      recorderCloseRequested = true;
      recorderWindow?.webContents.send("recording:global-stop");
      if (!recorderCloseTimeout) {
        recorderCloseTimeout = setTimeout(() => {
          // The renderer didn't finish stopping in time (hung stop, slow
          // final-chunk flush/remux, or a stop swallowed during countdown).
          // Force the window closed, but mark the project failed like the crash
          // path so it can never get stuck in status "recording" forever.
          const abandonedProjectId = activeRecordingProjectId;
          activeRecordingProjectId = null;
          unregisterRecordingShortcut();
          recorderCloseTimeout = null;
          recorderCloseRequested = false;
          recorderWindow?.destroy();
          if (abandonedProjectId) {
            void projectStore
              .markFailed({
                projectId: abandonedProjectId,
                error: "The recorder was closed before the recording finished saving."
              })
              .then((project) => getProjectLibrary().upsert(project))
              .catch(() => undefined);
          }
        }, 8000);
      }
    }
  });
  recorderWindow.webContents.on("render-process-gone", () => {
    const crashedProjectId = activeRecordingProjectId;
    activeRecordingProjectId = null;
    recorderCloseRequested = false;
    unregisterRecordingShortcut();
    if (recorderCloseTimeout) {
      clearTimeout(recorderCloseTimeout);
      recorderCloseTimeout = null;
    }
    recorderWindow?.destroy();
    if (crashedProjectId) {
      void projectStore.markFailed({
        projectId: crashedProjectId,
        error: "The recorder process stopped unexpectedly."
      }).then((project) => getProjectLibrary().upsert(project)).catch(() => undefined);
    }
  });
  recorderWindow.on("closed", () => {
    recorderCloseRequested = false;
    if (recorderCloseTimeout) {
      clearTimeout(recorderCloseTimeout);
      recorderCloseTimeout = null;
    }
    recorderWindow = null;
    void closeDisplayOverlay();
  });
  attachDevToolsShortcuts(recorderWindow);

  await loadRendererView(recorderWindow, "controller");

  // Fallback in case ready-to-show has already fired or is skipped, so the
  // window can never get stuck hidden.
  if (recorderWindow && !recorderWindow.isDestroyed() && !recorderWindow.isVisible()) {
    recorderWindow.show();
    recorderWindow.focus();
  }
}

async function loadRendererView(
  window: BrowserWindow,
  view: "main" | "controller" | "editor" | "permission-guide",
  params: Record<string, string> = {}
): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const url = devServerUrl
    ? new URL(devServerUrl)
    : new URL(pathToFileURL(path.join(__dirname, "../../dist-renderer/index.html")).toString());

  url.searchParams.set("view", view);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  await window.loadURL(url.toString());
}

async function showPermissionGuideWindow(kind: "screen" | "camera" | "microphone"): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  if (permissionGuideWindow && !permissionGuideWindow.isDestroyed()) {
    await loadRendererView(permissionGuideWindow, "permission-guide", { kind });
    positionPermissionGuideWindow(permissionGuideWindow);
    permissionGuideWindow.showInactive();
    permissionGuideWindow.moveTop();
    return;
  }

  const display = electronScreen.getPrimaryDisplay();
  const width = getPermissionGuideSize(display).width;
  const height = getPermissionGuideSize(display).height;
  const { x, y } = getPermissionGuidePosition(display, width, height);

  permissionGuideWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    acceptFirstMouse: true,
    title: "Open Video Craft Permission Guide",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  permissionGuideWindow.setAlwaysOnTop(true, "screen-saver");
  permissionGuideWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  permissionGuideWindow.on("closed", () => {
    permissionGuideWindow = null;
  });
  attachDevToolsShortcuts(permissionGuideWindow);

  await loadRendererView(permissionGuideWindow, "permission-guide", { kind });
  permissionGuideWindow.showInactive();
  permissionGuideWindow.moveTop();
}

function positionPermissionGuideWindow(window: BrowserWindow): void {
  const display = electronScreen.getPrimaryDisplay();
  const size = getPermissionGuideSize(display);
  const position = getPermissionGuidePosition(display, size.width, size.height);

  window.setBounds({
    ...position,
    ...size
  });
}

function getPermissionGuideSize(display: Electron.Display): Electron.Size {
  return {
    width: Math.min(680, Math.max(520, display.workArea.width - 160)),
    height: 168
  };
}

function getPermissionGuidePosition(
  display: Electron.Display,
  width: number,
  height: number
): Electron.Point {
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + display.workArea.height - height - 54)
  };
}

async function openEditorWindow(projectId?: string | null): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 760,
      minHeight: 600,
      title: "Open Video Craft Editor",
      icon: getAppIconPath(),
      backgroundColor: "#121317",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
      stopEditorStateWatcher();
      void closeDisplayOverlay();
      closePermissionGuideWindow();
    });
    attachUnsavedChangesGuard(mainWindow);
    attachDevToolsShortcuts(mainWindow);
  }

  await loadRendererView(mainWindow, "editor", projectId ? { projectId } : {});
  mainWindow.show();
  mainWindow.focus();
}

// Overlay show/hide requests arrive concurrently from the renderer (toggle,
// state changes, recording lifecycle). Handlers await window loads, so without
// serialization two interleaved shows can orphan a border window that nothing
// can close anymore. Every overlay IPC operation runs through this queue.
let overlayOpQueue: Promise<unknown> = Promise.resolve();

function enqueueOverlayOp<T>(op: () => Promise<T> | T): Promise<T> {
  const run = overlayOpQueue.then(op, op);
  overlayOpQueue = run.catch(() => undefined);
  return run;
}

async function showDisplayOverlay(sourceId: string): Promise<SourceOverlayResult> {
  // Do not create a display-sized BrowserWindow for capture feedback. On some
  // GPU/compositor combinations (seen on both macOS and Windows), a nominally
  // transparent overlay can be promoted to an opaque green surface and hide
  // the user's display. Keeping this IPC as a no-op also protects older
  // renderer bundles that may still request the legacy overlay.
  void sourceId;
  await closeDisplayOverlay();
  return {
    shown: false,
    reason: "The selected screen is shown in the recorder controller."
  };
}

// The recording border is drawn differently per platform:
//
// - Windows enforces a minimum window size, so the four thin strip windows used
//   elsewhere balloon into wide opaque bands that cover the screen edges and
//   obstruct clicks. One transparent, fully click-through window that draws a
//   thin semi-transparent border in CSS avoids that entirely and lets the user
//   see through it. On Windows, content protection maps to
//   WDA_EXCLUDEFROMCAPTURE, which is safe on a transparent window and still
//   keeps the border out of the recording.
//
// - macOS/Linux use opaque, content-protected strips. Protecting an opaque
//   window is the only combination that keeps the border out of the recording
//   without triggering the macOS bug where transparent + protected composites
//   the whole window as solid black on screen.
async function createDisplayOverlayWindows(
  display: Electron.Display
): Promise<BrowserWindow[]> {
  if (process.platform === "win32") {
    const overlay = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.setContentProtection(true);
    try {
      await overlay.loadURL(createDisplayOverlayBorderHtml());
    } catch {
      // A failed load still leaves a harmless invisible click-through window.
    }
    if (!overlay.isDestroyed()) {
      overlay.showInactive();
    }
    return [overlay];
  }

  const stripBounds = getDisplayOverlayStripBounds(display, process.platform);
  return stripBounds.map((bounds) => {
    const strip = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      backgroundColor: displayOverlayStripColor,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    strip.setIgnoreMouseEvents(true, { forward: true });
    strip.setAlwaysOnTop(true, "screen-saver");
    strip.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    strip.setContentProtection(true);
    strip.showInactive();
    return strip;
  });
}

function createDisplayOverlayBorderHtml(): string {
  // A thin, semi-transparent green rectangle outline. box-sizing keeps the
  // border inside the display bounds; pointer-events:none makes doubly sure the
  // click-through window never intercepts input.
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;cursor:default}#border{position:fixed;inset:0;box-sizing:border-box;border:4px solid ${displayOverlayBorderColor};border-radius:3px;pointer-events:none}</style><div id="border"></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function closeDisplayOverlay(): Promise<void> {
  const strips = displayOverlayWindows;
  displayOverlayWindows = [];
  activeDisplayOverlaySourceId = null;
  activeDisplayOverlayDisplayId = null;

  for (const strip of strips) {
    if (!strip.isDestroyed()) {
      strip.close();
    }
  }
}

function closePermissionGuideWindow(): void {
  if (permissionGuideWindow && !permissionGuideWindow.isDestroyed()) {
    permissionGuideWindow.close();
  }

  permissionGuideWindow = null;
}

function attachDevToolsShortcuts(window: BrowserWindow): void {
  // Windows users need access to Chromium's diagnostics in installed builds
  // when capture, codec, or GPU behavior differs from development. Keep the
  // packaged macOS surface locked down unless explicitly enabled, while
  // allowing the conventional F12 / Ctrl+Shift+I shortcuts on Windows.
  const devToolsEnabled = shouldEnableDevTools({
    isPackaged: app.isPackaged,
    platform: process.platform,
    environmentOverride: process.env.OVC_ENABLE_DEVTOOLS
  });
  if (!devToolsEnabled) {
    return;
  }
  window.webContents.on("before-input-event", (event, input) => {
    const opensDevTools =
      input.key === "F12" ||
      (input.key.toLowerCase() === "i" && input.control && input.shift);

    if (!opensDevTools) {
      return;
    }

    event.preventDefault();

    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools();
      return;
    }

    window.webContents.openDevTools({ mode: "detach" });
  });
}

function getDisplayForSource(source: Electron.DesktopCapturerSource): Electron.Display | null {
  return resolveDisplayForOverlay(
    { id: source.id, displayId: source.display_id },
    electronScreen.getAllDisplays(),
    electronScreen.getPrimaryDisplay()
  );
}

function refreshDisplayOverlay(): void {
  const sourceId = activeDisplayOverlaySourceId;
  const displayId = activeDisplayOverlayDisplayId;
  if (!sourceId) {
    return;
  }

  void enqueueOverlayOp(async () => {
    const refreshedSource = sourceCache.get(sourceId) ??
      [...sourceCache.values()].find((source) =>
        source.id.startsWith("screen:") &&
        Boolean(displayId) &&
        source.display_id === displayId
      );
    if (refreshedSource) {
      await showDisplayOverlay(refreshedSource.id);
      return;
    }

    // A source-list refresh can replace capture-source ids. Display ids are
    // stable across those refreshes, so keep the border attached directly to
    // the connected display until the next source list supplies a new id.
    const display = displayId
      ? electronScreen.getAllDisplays().find((item) => String(item.id) === displayId) ?? null
      : null;
    await closeDisplayOverlay();
    if (display) {
      displayOverlayWindows = await createDisplayOverlayWindows(display);
      activeDisplayOverlaySourceId = sourceId;
      activeDisplayOverlayDisplayId = displayId;
    }
  });
}

async function setActiveEditorProject(projectId: string): Promise<void> {
  const project = projectStore.getProject(projectId);
  await writeJsonFileAtomic(path.join(app.getPath("userData"), "active-editor.json"), {
    schemaVersion: 1,
    projectId,
    rootPath: project.rootPath,
    updatedAt: new Date().toISOString()
  });
  if (watchedEditorProjectId === projectId && editorStateWatcher) return;
  editorStateWatcher?.close();
  editorStateWatcher = null;
  watchedEditorProjectId = projectId;
  editorStateWatcher = watchFs(project.rootPath, (_eventType, filename) => {
    const name = filename?.toString() ?? null;
    if (name && name !== "editor.json" && !name.startsWith(".editor.json.")) return;
    if (editorStateWatchTimer) clearTimeout(editorStateWatchTimer);
    editorStateWatchTimer = setTimeout(() => {
      void (async () => {
        try {
          const state = await projectStore.readEditorState(projectId);
          if (state && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("editor:project-state-changed", toEditorProjectStateView(projectId, state));
          }
        } catch {
          // Atomic replacement can briefly race a watcher event; the next event
          // or explicit load will recover without disturbing the editor.
        }
      })();
    }, 120);
  });
}

function stopEditorStateWatcher(): void {
  if (editorStateWatchTimer) clearTimeout(editorStateWatchTimer);
  editorStateWatchTimer = null;
  editorStateWatcher?.close();
  editorStateWatcher = null;
  watchedEditorProjectId = null;
}

function registerDisplayOverlayRefreshHandlers(): void {
  electronScreen.on("display-added", refreshDisplayOverlay);
  electronScreen.on("display-removed", refreshDisplayOverlay);
  electronScreen.on("display-metrics-changed", refreshDisplayOverlay);
}

function registerRecordingPowerHandlers(): void {
  powerMonitor.on("suspend", () => {
    recorderWindow?.webContents.send("recording:power-suspend");
  });
  powerMonitor.on("resume", () => {
    recorderWindow?.webContents.send("recording:power-resume");
  });
}

function registerIpc(): void {
  registerAppStatusIpc();

  ipcMain.handle("ai:get-status", (): Promise<AiConnectionStatus> =>
    getAiConnectionManager().getStatus()
  );
  ipcMain.handle("ai:configure", (_event, request: ConfigureAiProviderRequest): Promise<AiConnectionStatus> => {
    assertAiProvider(request?.provider);
    return getAiConnectionManager().configure(request.provider, request.privacyAccepted === true);
  });
  ipcMain.handle("ai:disconnect", (_event, provider: AiProvider): Promise<AiConnectionStatus> => {
    assertAiProvider(provider);
    return getAiConnectionManager().disconnect(provider);
  });

  ipcMain.handle("providers:get", (): Promise<ProviderKeysView> =>
    getProviderKeysManager().getView()
  );
  ipcMain.handle(
    "providers:reveal",
    (_event, provider: ProviderKeyId): Promise<string | null> => {
      assertProviderKeyId(provider);
      const keys = getProviderKeysManager();
      return provider === "cohere" ? keys.getCohereKey() : keys.getGeminiKey();
    }
  );
  ipcMain.handle(
    "providers:update",
    (_event, request: UpdateProviderKeysRequest): Promise<ProviderKeysView> => {
      assertUpdateProviderKeysRequest(request);
      return getProviderKeysManager().update(request);
    }
  );

  ipcMain.handle(
    "stt:transcribe",
    async (event, request: SttTranscribeRequest): Promise<SttTranscribeResult> => {
      assertSttTranscribeRequest(request);
      const control = new AbortController();
      sttJobs.set(request.requestId, control);
      const keys = getProviderKeysManager();
      try {
        return await transcribeCloud(request, {
          resolveSourcePath: resolveMediaUrlToPath,
          getApiKey: (provider) =>
            provider === "cohere" ? keys.getCohereKey() : keys.getGeminiKey(),
          getCohereLanguage: () => keys.getCohereLanguage(),
          scratchDirectory: path.join(app.getPath("userData"), "stt-tmp"),
          onProgress: (progress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send("stt:progress", { requestId: request.requestId, ...progress });
            }
          },
          signal: control.signal
        });
      } finally {
        sttJobs.delete(request.requestId);
      }
    }
  );
  ipcMain.handle("stt:cancel", (_event, requestId: unknown): boolean => {
    if (typeof requestId !== "string") return false;
    const control = sttJobs.get(requestId);
    control?.abort();
    return Boolean(control);
  });

  ipcMain.handle("music:get-status", (): Promise<MusicSetupStatus> => {
    if (isMacAppStoreBuild()) {
      return Promise.resolve({
        pythonPath: null,
        pythonVersion: null,
        venvReady: false,
        acestepInstalled: false,
        checkpointsDownloaded: false,
        installing: false,
        generatingJobId: null
      });
    }
    return getMusicGenerationManager().getStatus();
  });
  ipcMain.handle("music:install", (event): Promise<MusicSetupStatus> => {
    if (isMacAppStoreBuild()) {
      return Promise.reject(new Error("Local music setup is unavailable in the Mac App Store build."));
    }
    return getMusicGenerationManager().install((progress) => {
      if (!event.sender.isDestroyed()) event.sender.send("music:setup-progress", progress);
    });
  });
  ipcMain.handle(
    "music:generate",
    async (event, request: MusicGenerateRequest): Promise<MusicGenerateResult> => {
      assertMusicGenerateRequest(request);
      const sendProgress = (progress: MusicGenerateProgressEvent) => {
        if (!event.sender.isDestroyed()) event.sender.send("music:generate-progress", progress);
      };

      let outputPath: string;
      let extension: string;
      let lyrics: string | null = null;

      if (request.engine === "acestep") {
        if (isMacAppStoreBuild()) {
          throw new Error("Local ACE-Step music generation is unavailable in the Mac App Store build.");
        }
        const generated = await getMusicGenerationManager().generateAceStep(request, sendProgress);
        outputPath = generated.outputPath;
        extension = "wav";
      } else {
        const apiKey = await getProviderKeysManager().getGeminiKey();
        if (!apiKey) {
          throw new Error("No Gemini API key is saved. Add one in the AI settings.");
        }
        const control = new AbortController();
        lyriaJobs.set(request.jobId, control);
        try {
          sendProgress({
            jobId: request.jobId,
            phase: "generating",
            percent: null,
            message: "Composing with Lyria…"
          });
          const output = await generateLyria({
            model: request.engine === "lyria-clip" ? "lyria-3-clip-preview" : "lyria-3-pro-preview",
            prompt: request.prompt,
            lyrics: request.lyrics,
            apiKey,
            signal: control.signal
          });
          extension = output.mimeType.includes("wav") ? "wav" : "mp3";
          outputPath = path.join(
            app.getPath("userData"), "acestep", "output", `${request.jobId}.${extension}`
          );
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, output.audio);
          lyrics = output.lyrics;
        } finally {
          lyriaJobs.delete(request.jobId);
        }
      }

      sendProgress({
        jobId: request.jobId,
        phase: "saving",
        percent: 100,
        message: "Adding to timeline…"
      });

      const durationMs = await probeMediaDurationMs(outputPath).catch(() => null);
      const importId = request.jobId;
      importedMediaCache.set(importId, outputPath);
      const promptSlug = request.prompt.trim().slice(0, 40) || "AI music";
      return {
        id: importId,
        name: `${promptSlug}.${extension}`,
        path: outputPath,
        url: `ovc-import://file/${encodeURIComponent(importId)}`,
        kind: "audio",
        extension,
        duration: durationMs === null ? null : durationMs / 1000,
        lyrics
      };
    }
  );
  ipcMain.handle("music:cancel", (_event, jobId: unknown): boolean => {
    if (typeof jobId !== "string") return false;
    const lyria = lyriaJobs.get(jobId);
    if (lyria) {
      lyria.abort();
      return true;
    }
    return getMusicGenerationManager().cancel(jobId);
  });

  ipcMain.handle(
    "gemini:chat-send",
    (_event, request: GeminiChatSendRequest): Promise<GeminiChatMessage[]> => {
      assertGeminiChatSendRequest(request);
      return getGeminiAgentManager().send(request);
    }
  );
  ipcMain.handle("gemini:chat-history", (_event, projectId: unknown): GeminiChatMessage[] => {
    return typeof projectId === "string" ? getGeminiAgentManager().getHistory(projectId) : [];
  });
  ipcMain.handle("gemini:chat-cancel", (_event, projectId: unknown): boolean => {
    return typeof projectId === "string" ? getGeminiAgentManager().cancel(projectId) : false;
  });
  ipcMain.handle("gemini:chat-reset", (_event, projectId: unknown): boolean => {
    if (typeof projectId !== "string") return false;
    getGeminiAgentManager().reset(projectId);
    return true;
  });

  ipcMain.handle("editor:set-session-state", async (_event, request: EditorSessionStateRequest): Promise<boolean> => {
    if (!request || typeof request.projectId !== "string" || typeof request.dirty !== "boolean") {
      throw new Error("Invalid editor session state.");
    }
    const project = projectStore.getProject(request.projectId);
    await Promise.all([
      setActiveEditorProject(request.projectId),
      setEditorSessionState(project.rootPath, request.dirty)
    ]);
    return true;
  });
  ipcMain.handle("editor:undo-agent-edit", async (_event, request: UndoAgentEditRequest): Promise<EditorProjectStateView> => {
    if (
      !request ||
      typeof request.projectId !== "string" ||
      !Number.isInteger(request.baseRevision) ||
      !isUuid(request.editId)
    ) {
      throw new Error("Invalid AI undo request.");
    }
    const project = projectStore.getProject(request.projectId);
    const state = await undoAgentEdit({ rootPath: project.rootPath, baseRevision: request.baseRevision, editId: request.editId });
    return toEditorProjectStateView(request.projectId, state);
  });

  ipcMain.handle("sources:list", async (): Promise<SourceSummary[]> => {
    // Request sources without live thumbnails or window icons. Capturing a
    // thumbnail per source forces Windows Graphics Capture to start a capturer
    // for every window, which floods the log with "Failed to start capture"
    // (E_INVALIDARG / -2147024809) for windows it cannot grab. The recorder UI
    // never renders these, so we substitute a lightweight fallback thumbnail.
    const sources = await listDesktopCapturerSources();

    sourceCache.clear();
    const summaries: SourceSummary[] = sources.map((source) => {
      sourceCache.set(source.id, source);

      return {
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        displayId: source.display_id,
        thumbnail: createFallbackThumbnail(source.name),
        appIcon: null
      };
    });
    if (activeDisplayOverlayDisplayId) {
      const replacement = sources.find((source) =>
        source.id.startsWith("screen:") &&
        source.display_id === activeDisplayOverlayDisplayId
      );
      if (replacement) activeDisplayOverlaySourceId = replacement.id;
    }
    return summaries;
  });

  ipcMain.handle("permissions:get-status", (): DesktopPermissionStatus => {
    return getDesktopPermissionStatus();
  });

  ipcMain.handle("permissions:open-settings", async (_event, kind: unknown): Promise<boolean> => {
    return openPermissionSettings(assertDesktopPermissionKind(kind));
  });

  ipcMain.handle("permissions:show-guide", async (_event, kind: unknown): Promise<boolean> => {
    const permissionKind = assertDesktopPermissionKind(kind);
    const opened = await openPermissionSettings(permissionKind);
    await delay(450);
    await showPermissionGuideWindow(permissionKind);
    return opened;
  });

  ipcMain.handle("permissions:request-media", async (_event, kind: unknown): Promise<boolean> => {
    return requestMediaPermission(assertMediaPermissionKind(kind));
  });

  ipcMain.on("permissions:start-app-drag", (event): void => {
    startAppBundleDrag(event, getAppIconPath);
  });

  ipcMain.handle("permissions:reveal-app", (): boolean => {
    return revealAppBundleInFinder();
  });

  ipcMain.handle("capture:select-display-source", (_event, sourceId: string): boolean => {
    const source = sourceCache.get(sourceId);

    if (!source) {
      throw new Error("Selected display source is no longer available.");
    }

    selectedDisplaySource = source;
    return true;
  });

  ipcMain.handle("windows:open-recorder-controller", async (): Promise<boolean> => {
    await createRecorderWindow();
    return true;
  });

  ipcMain.handle("windows:minimize-current", (event): boolean => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return false;
    }

    // The recorder floats always-on-top with no taskbar entry; both of those
    // stop a normal minimize from actually parking in the dock/taskbar. Relax
    // them while minimized so the window minimizes for real, and restore the
    // floating behavior when the user brings it back.
    if (window === recorderWindow) {
      window.setAlwaysOnTop(false);
      window.setSkipTaskbar(false);
      const previousRestoreHandler = recorderRestoreHandlers.get(window);
      if (previousRestoreHandler) window.removeListener("restore", previousRestoreHandler);
      const restoreFloatingRecorder = () => {
        recorderRestoreHandlers.delete(window);
        if (!window.isDestroyed()) {
          window.setSkipTaskbar(true);
          window.setAlwaysOnTop(true, "screen-saver");
        }
      };
      recorderRestoreHandlers.set(window, restoreFloatingRecorder);
      window.once("restore", restoreFloatingRecorder);
    }

    window.minimize();
    return true;
  });

  ipcMain.handle("windows:close-current", (event): boolean => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });

  ipcMain.handle("windows:hide-current", (event): boolean => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
    return true;
  });

  ipcMain.handle("windows:show-current", (event): boolean => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.show();
    window?.focus();
    return true;
  });

  ipcMain.handle("windows:set-recorder-compact", (_event, compact: boolean): boolean => {
    setRecorderWindowCompact(compact);
    return true;
  });

  ipcMain.handle("windows:open-editor", async (_event, projectId?: string | null): Promise<boolean> => {
    await openEditorWindow(projectId);
    finishRequestedRecorderClose();
    return true;
  });

  ipcMain.handle("windows:open-main", async (event): Promise<boolean> => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window || window.isDestroyed()) {
      await createWindow();
      return true;
    }

    await loadRendererView(window, "main");
    window.show();
    window.focus();
    return true;
  });

  ipcMain.handle("editor:import-media", async (): Promise<ImportedMediaFile[]> => {
    return showImportMediaDialog(getDialogParentWindow(), (id, filePath) => {
      importedMediaCache.set(id, filePath);
    }, (resourcePath, bookmark) => {
      getSecurityScopedResources().activate(resourcePath, bookmark);
    });
  });

  ipcMain.handle(
    "editor:import-media-paths",
    async (_event, filePaths: unknown): Promise<ImportedMediaFile[]> => {
      if (!Array.isArray(filePaths)) {
        return [];
      }
      const paths = filePaths.filter((value): value is string => typeof value === "string");
      return importMediaFromPaths(
        paths,
        (id, filePath) => importedMediaCache.set(id, filePath),
        getDialogParentWindow()
      );
    }
  );

  ipcMain.handle("editor:remove-imported-media", (_event, importId: string): boolean => {
    return importedMediaCache.delete(importId);
  });

  ipcMain.handle(
    "editor:load-project-state",
    async (_event, projectId: string): Promise<EditorProjectStateView | null> => {
      const state = await projectStore.readEditorState(projectId);
      return state ? toEditorProjectStateView(projectId, state) : null;
    }
  );

  ipcMain.handle(
    "editor:save-project-state",
    async (_event, request: SaveEditorProjectStateRequest): Promise<EditorProjectStateView> => {
      assertSaveEditorProjectStateRequest(request);
      const saved = await projectStore.saveEditorState(
        request.projectId,
        {
          baseRevision: request.baseRevision,
          state: request.state,
          imports: request.imports
        },
        (importId) => importedMediaCache.get(importId) ?? null
      );
      const project = projectStore.getProject(request.projectId);
      await getProjectLibrary().upsert(project);
      return toEditorProjectStateView(request.projectId, saved);
    }
  );

  ipcMain.handle(
    "editor:export-video",
    async (event, request: ExportVideoRequest): Promise<ExportVideoResult | null> => {
      assertExportVideoRequest(request);
      const jobId = request.jobId as string;
      const control = exportJobs.begin(jobId, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send("editor:export-progress", progress);
      });
      try {
        control.onProgress(0, "Preparing export…");
        return await exportEditorVideo(request, {
          projectStore,
          importedMediaCache,
          getDialogParentWindow,
          activateSecurityScopedResource: (resourcePath, bookmark) => {
            getSecurityScopedResources().activate(resourcePath, bookmark);
          },
          control
        });
      } finally {
        exportJobs.finish(jobId);
      }
    }
  );
  ipcMain.handle("editor:cancel-export", (_event, jobId: unknown): boolean => {
    return isUuid(jobId) ? exportJobs.cancel(jobId) : false;
  });

  ipcMain.handle("overlays:show-source-border", (_event, sourceId: string) => {
    return enqueueOverlayOp(() => showDisplayOverlay(sourceId));
  });

  ipcMain.handle("overlays:hide-source-border", (): Promise<boolean> => {
    return enqueueOverlayOp(async () => {
      await closeDisplayOverlay();
      return true;
    });
  });

  ipcMain.handle("projects:choose-base-directory", async (): Promise<string | null> => {
    const directory = await showBaseDirectoryDialog(
      getDialogParentWindow(),
      (resourcePath, bookmark) => getSecurityScopedResources().remember(resourcePath, bookmark)
    );
    if (directory) {
      grantedBaseDirectories.add(path.resolve(directory));
    }
    return directory;
  });

  ipcMain.handle("projects:list-recent", async () => {
    const entries = await getProjectLibrary().listRecent();

    // Loading available projects registers their media with ovc-media:// and
    // gives the launcher a real first-frame source instead of placeholder art.
    return Promise.all(
      entries.map(async (entry): Promise<ProjectLibraryEntry> => {
        if (!entry.available) return { ...entry, thumbnailUrl: null };

        try {
          const project = projectStore.hasProject(entry.id)
            ? projectStore.getProject(entry.id)
            : await projectStore.loadProject(entry.rootPath);
          return {
            ...entry,
            thumbnailUrl: project.mediaUrls.screen ?? project.mediaUrls.camera ?? null
          };
        } catch {
          return { ...entry, thumbnailUrl: null };
        }
      })
    );
  });

  ipcMain.handle("projects:get", async (_event, projectId: string) => {
    return getProjectForEditor(projectId);
  });

  ipcMain.handle("projects:open-existing-project-folder", async (): Promise<ProjectView | null> => {
    const projectRootPath = await showExistingProjectFolderDialog(
      getDialogParentWindow(),
      (resourcePath, bookmark) => getSecurityScopedResources().remember(resourcePath, bookmark)
    );
    if (!projectRootPath) {
      return null;
    }

    const project = await projectStore.loadProject(projectRootPath);
    await getProjectLibrary().upsert(project);
    return project;
  });

  ipcMain.handle("projects:remove-from-recent", async (_event, projectId: string): Promise<boolean> => {
    return getProjectLibrary().remove(projectId);
  });

  ipcMain.handle("projects:delete", async (_event, projectId: string): Promise<boolean> => {
    const entry = await getProjectLibrary().get(projectId);
    if (!entry) {
      return false;
    }

    const parentWindow = getDialogParentWindow();
    const confirmOptions = {
      type: "warning" as const,
      buttons: ["Delete", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      title: "Delete project",
      message: `Delete "${entry.name}"?`,
      detail: `The project folder will be moved to the Trash:\n${entry.rootPath}`
    };
    const { response } = parentWindow
      ? await dialog.showMessageBox(parentWindow, confirmOptions)
      : await dialog.showMessageBox(confirmOptions);

    if (response !== 0) {
      return false;
    }

    // Re-read project.json immediately before deletion. The recent-projects
    // index is user-writable and must never be trusted as an arbitrary rm path.
    await assertProjectDeletionTarget(entry.rootPath, projectId);

    // Never fall back to recursive permanent deletion. A Trash failure is
    // recoverable and should be surfaced to the user instead of escalating.
    try {
      await shell.trashItem(entry.rootPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not move the project to the Trash. ${detail}`);
    }

    projectStore.forgetProject(projectId);
    await getProjectLibrary().remove(projectId);
    return true;
  });

  ipcMain.handle("projects:discard", async (_event, projectId: string): Promise<boolean> => {
    const discarded = await projectStore.discardProject(projectId);
    if (activeRecordingProjectId === projectId) {
      activeRecordingProjectId = null;
      unregisterRecordingShortcut();
      finishRequestedRecorderClose();
    }
    await getProjectLibrary().remove(projectId);
    return discarded;
  });

  ipcMain.handle(
    "projects:create",
    async (_event, request: CreateProjectRequest) => {
      let baseDirectory = request.baseDirectory;

      if (baseDirectory) {
        // Only honor a renderer-supplied path if it was granted through the
        // folder picker; otherwise the renderer could write project folders
        // anywhere the user can.
        if (!grantedBaseDirectories.has(path.resolve(baseDirectory))) {
          throw new Error("The chosen project folder was not granted through the folder picker.");
        }
      } else {
        baseDirectory = await showBaseDirectoryDialog(
          getDialogParentWindow(),
          (resourcePath, bookmark) => getSecurityScopedResources().remember(resourcePath, bookmark)
        );

        if (!baseDirectory) {
          throw new Error("A project folder is required to save this project.");
        }
        grantedBaseDirectories.add(path.resolve(baseDirectory));
      }

      const project = await projectStore.createProject({
        name: typeof request.name === "string" ? request.name : "",
        baseDirectory
      });
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle(
    "projects:rename",
    async (_event, request: RenameProjectRequest): Promise<ProjectView> => {
      if (!request || typeof request.projectId !== "string" || typeof request.name !== "string") {
        throw new Error("A project id and name are required to rename a project.");
      }
      const project = await projectStore.renameProject(request.projectId, request.name);
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle(
    "recording:start",
    async (_event, request: StartRecordingRequest) => {
      assertStartRecordingRequest(request);
      const project = await projectStore.startRecording(request);
      activeRecordingProjectId = project.id;
      registerRecordingShortcut();
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle("recording:write-chunk", async (_event, request: WriteChunkRequest) => {
    const chunk = request?.chunk;
    if (!(chunk instanceof ArrayBuffer) || chunk.byteLength > maxRecordingChunkBytes) {
      throw new Error("Invalid recording chunk.");
    }
    return projectStore.appendChunk(request.projectId, request.track, chunk);
  });

  ipcMain.handle(
    "recording:stop",
    async (_event, request: StopRecordingRequest) => {
      const project = await projectStore.stopRecording(request);
      activeRecordingProjectId = null;
      unregisterRecordingShortcut();
      clearRecorderCloseTimeout();
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle(
    "recording:fail",
    async (_event, request: FailRecordingRequest) => {
      const project = await projectStore.markFailed(request);
      if (activeRecordingProjectId === request.projectId) {
        activeRecordingProjectId = null;
        unregisterRecordingShortcut();
      }
      finishRequestedRecorderClose();
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle("ffmpeg:prepare-audio", async (_event, projectId: string) => {
    // Rewrite the recorded video containers with duration + seek cues so the
    // editor can seek them. A failed remux keeps the raw recording playable.
    const recordedVideoPaths: string[] = [];
    for (const track of ["screen", "camera"] as const) {
      const mediaPath = projectStore.getMediaPath(projectId, track);
      if (mediaPath) {
        await remuxWebm(mediaPath).catch(() => undefined);
        recordedVideoPaths.push(mediaPath);
      }
    }

    let mediaDurationMs: number | null = null;
    for (const mediaPath of recordedVideoPaths) {
      mediaDurationMs = await probeMediaDurationMs(mediaPath);
      if (mediaDurationMs !== null) break;
    }

    const micInputPath = projectStore.getMicWebmPath(projectId);
    const systemInputPath = projectStore.getSystemWebmPath(projectId);

    const micBytes = micInputPath
      ? await convertWebmAudioToWav(micInputPath, projectStore.getMicWavPath(projectId))
      : 0;
    const systemBytes = systemInputPath
      ? await convertWebmAudioToWav(systemInputPath, projectStore.getSystemWavPath(projectId))
      : 0;

    const project = await projectStore.completeAudio(projectId, {
      mic: micBytes,
      system: systemBytes
    }, mediaDurationMs);
    await getProjectLibrary().upsert(project);
    return project;
  });
}

function assertAiProvider(value: unknown): asserts value is AiProvider {
  if (value !== "codex" && value !== "claude") throw new Error("Unknown AI provider.");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function getProjectForEditor(projectId: string): Promise<ProjectView> {
  if (projectStore.hasProject(projectId)) {
    const project = projectStore.getProject(projectId);
    await getProjectLibrary().upsert(project);
    return project;
  }

  const entry = await getProjectLibrary().get(projectId);
  if (!entry || !entry.available) {
    throw new Error(`Project "${projectId}" is no longer available.`);
  }

  const project = await projectStore.loadProject(entry.rootPath);
  await getProjectLibrary().upsert(project);
  return project;
}

function setRecorderWindowCompact(compact: boolean): void {
  if (!recorderWindow || recorderWindow.isDestroyed()) {
    return;
  }

  const size = compact ? recorderWindowSize.compact : recorderWindowSize.expanded;
  const bounds = recorderWindow.getBounds();
  const x = Math.round(bounds.x + bounds.width / 2 - size.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2 - size.height / 2);

  recorderWindow.setBounds(
    {
      x,
      y,
      width: size.width,
      height: size.height
    },
    false
  );
  recorderWindow.show();
  recorderWindow.focus();
  recorderWindow.setAlwaysOnTop(true, "screen-saver");
}

function toEditorProjectStateView(
  projectId: string,
  state: EditorProjectStateFile
): EditorProjectStateView {
  return {
    revision: state.revision,
    savedAt: state.savedAt,
    state: state.state,
    lastMutation: state.lastMutation,
    imports: state.imports.map((imported) => {
      const filePath = projectStore.resolveProjectFile(projectId, imported.relativePath);
      importedMediaCache.set(imported.id, filePath);
      return {
        id: imported.id,
        name: imported.name,
        kind: imported.kind,
        extension: imported.extension,
        duration: imported.duration,
        url: createMediaUrl(projectId, imported.relativePath)
      };
    })
  };
}

function registerRecordingShortcut(): void {
  if (!globalShortcut.isRegistered("CommandOrControl+Shift+S")) {
    globalShortcut.register("CommandOrControl+Shift+S", () => {
      recorderWindow?.webContents.send("recording:global-stop");
    });
  }
}

function unregisterRecordingShortcut(): void {
  globalShortcut.unregister("CommandOrControl+Shift+S");
}

function finishRequestedRecorderClose(): void {
  clearRecorderCloseTimeout();
  if (recorderCloseRequested) {
    recorderCloseRequested = false;
    recorderWindow?.close();
  }
}

function clearRecorderCloseTimeout(): void {
  if (recorderCloseTimeout) {
    clearTimeout(recorderCloseTimeout);
    recorderCloseTimeout = null;
  }
}

function registerNavigationHardening(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, targetUrl) => {
      const currentUrl = contents.getURL();
      if (!currentUrl) {
        return;
      }
      try {
        if (new URL(targetUrl).origin === new URL(currentUrl).origin) {
          return;
        }
      } catch {
        // Invalid navigation targets are always blocked.
      }
      event.preventDefault();
    });
  });
}

function getDialogParentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? recorderWindow;
}

// On macOS the clipboard/window key-equivalents (Cmd+C/V/X/A/Z, Cmd+Q/W/H/M)
// are routed through the application menu. Setting the menu to null there
// silently disables copy/paste/select-all in every text input (subtitle
// editing, project search). A minimal role-based menu restores those without
// adding any custom app chrome. Windows/Linux need no app menu — clipboard
// shortcuts work without one and autoHideMenuBar keeps the bar hidden.
function applyApplicationMenu(): void {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    { role: "editMenu" },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  configureAppIdentity();
  await getSecurityScopedResources().restoreAll();
  applyApplicationMenu();
  registerNavigationHardening();
  registerPermissionRequestHandlers({
    getMainWindow: () => mainWindow,
    getRecorderWindow: () => recorderWindow,
    getSelectedDisplaySource: () => selectedDisplaySource
  });
  registerCustomMediaProtocol({ projectStore, importedMediaCache });
  registerIpc();
  registerDisplayOverlayRefreshHandlers();
  registerRecordingPowerHandlers();
  await createWindow();
  startAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("before-quit", () => {
  stopEditorStateWatcher();
  void closeDisplayOverlay();
  closePermissionGuideWindow();
});

app.on("will-quit", () => {
  void closeDisplayOverlay();
  closePermissionGuideWindow();
  killActiveFfmpegProcesses();
  killActiveSttProcesses();
  musicGenerationManager?.killActiveProcesses();
  globalShortcut.unregisterAll();
  securityScopedResources?.stopAll();
});

app.on("window-all-closed", () => {
  void closeDisplayOverlay();
  closePermissionGuideWindow();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
