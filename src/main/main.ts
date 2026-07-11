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
  protocol,
  screen as electronScreen,
  shell,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configureAppIdentity, getAppIconPath } from "./app-shell";
import { registerAppStatusIpc } from "./app-status-ipc";
import { getProductVersion } from "./app-version";
import { startAutoUpdates } from "./auto-updates";
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
  chooseExportPath as showExportPathDialog,
  importMediaFiles as showImportMediaDialog
} from "./file-dialogs";
import { convertWebmAudioToWav, exportVideo, remuxWebm } from "./ffmpeg";
import { registerMediaProtocol as registerCustomMediaProtocol } from "./media-protocols";
import { ProjectLibrary } from "./project-library";
import { createMediaUrl, ProjectStore } from "./project-store";
import type {
  CreateProjectRequest,
  DesktopPermissionStatus,
  EditorProjectStateFile,
  EditorProjectStateView,
  ExportVideoRequest,
  ExportVideoResult,
  FailRecordingRequest,
  ImportedMediaFile,
  ProjectLibraryEntry,
  ProjectView,
  SaveEditorProjectStateRequest,
  SourceOverlayResult,
  SourceSummary,
  StartRecordingRequest,
  StopRecordingRequest,
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
let selectedDisplaySource: Electron.DesktopCapturerSource | null = null;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let activeRecordingProjectId: string | null = null;
let displayOverlayWindows: BrowserWindow[] = [];
let activeDisplayOverlaySourceId: string | null = null;
let permissionGuideWindow: BrowserWindow | null = null;
let projectLibrary: ProjectLibrary | null = null;

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

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
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
    void closeDisplayOverlay();
    closePermissionGuideWindow();
  });
  attachDevToolsShortcuts(mainWindow);

  await loadRendererView(mainWindow, "main");
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
  recorderWindow.once("ready-to-show", () => {
    if (recorderWindow && !recorderWindow.isDestroyed()) {
      recorderWindow.show();
      recorderWindow.focus();
    }
  });
  recorderWindow.on("close", (event) => {
    if (activeRecordingProjectId) {
      event.preventDefault();
      recorderWindow?.webContents.send("recording:global-stop");
    }
  });
  recorderWindow.on("closed", () => {
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
      minWidth: 1080,
      minHeight: 720,
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
      void closeDisplayOverlay();
      closePermissionGuideWindow();
    });
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
  const source = sourceCache.get(sourceId);

  if (!source) {
    await closeDisplayOverlay();
    return {
      shown: false,
      reason: "Selected source is no longer available."
    };
  }

  if (!source.id.startsWith("screen:")) {
    await closeDisplayOverlay();
    return {
      shown: false,
      reason: "Display border is only shown for full-screen sources."
    };
  }

  const display = getDisplayForSource(source);
  await closeDisplayOverlay();

  if (!display) {
    return {
      shown: false,
      reason: "The selected display is no longer connected."
    };
  }

  // Electron Screen and BrowserWindow bounds are both DIP coordinates. Keeping
  // the overlay in that coordinate space prevents Windows DPI scaling from
  // creating a border larger than the selected display.
  displayOverlayWindows = await createDisplayOverlayWindows(display);
  activeDisplayOverlaySourceId = sourceId;

  return {
    shown: true,
    reason: null
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
  if (!sourceId) {
    return;
  }

  void enqueueOverlayOp(() => showDisplayOverlay(sourceId));
}

function registerDisplayOverlayRefreshHandlers(): void {
  electronScreen.on("display-added", refreshDisplayOverlay);
  electronScreen.on("display-removed", refreshDisplayOverlay);
  electronScreen.on("display-metrics-changed", refreshDisplayOverlay);
}

function registerIpc(): void {
  registerAppStatusIpc();

  ipcMain.handle("sources:list", async (): Promise<SourceSummary[]> => {
    // Request sources without live thumbnails or window icons. Capturing a
    // thumbnail per source forces Windows Graphics Capture to start a capturer
    // for every window, which floods the log with "Failed to start capture"
    // (E_INVALIDARG / -2147024809) for windows it cannot grab. The recorder UI
    // never renders these, so we substitute a lightweight fallback thumbnail.
    const sources = await listDesktopCapturerSources();

    sourceCache.clear();
    return sources.map((source) => {
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
      window.once("restore", () => {
        if (!window.isDestroyed()) {
          window.setSkipTaskbar(true);
          window.setAlwaysOnTop(true, "screen-saver");
        }
      });
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
    });
  });

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
    async (_event, request: ExportVideoRequest): Promise<ExportVideoResult | null> => {
      return exportEditorVideo(request);
    }
  );

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
    return showBaseDirectoryDialog(getDialogParentWindow());
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
    const projectRootPath = await showExistingProjectFolderDialog(getDialogParentWindow());
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

    // Prefer the OS Trash so an accidental delete stays recoverable; only fall
    // back to a permanent removal when the folder cannot be trashed.
    try {
      await shell.trashItem(entry.rootPath);
    } catch {
      await fs.rm(entry.rootPath, { recursive: true, force: true }).catch(() => undefined);
    }

    projectStore.forgetProject(projectId);
    await getProjectLibrary().remove(projectId);
    return true;
  });

  ipcMain.handle("projects:discard", async (_event, projectId: string): Promise<boolean> => {
    const discarded = await projectStore.discardProject(projectId);
    await getProjectLibrary().remove(projectId);
    return discarded;
  });

  ipcMain.handle(
    "projects:create",
    async (_event, request: CreateProjectRequest) => {
      let baseDirectory = request.baseDirectory;

      if (!baseDirectory) {
        baseDirectory = await showBaseDirectoryDialog(getDialogParentWindow());

        if (!baseDirectory) {
          throw new Error("A project folder is required before recording.");
        }
      }

      const project = await projectStore.createProject({
        name: request.name,
        baseDirectory
      });
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle(
    "recording:start",
    async (_event, request: StartRecordingRequest) => {
      const project = await projectStore.startRecording(request);
      activeRecordingProjectId = project.id;
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle("recording:write-chunk", async (_event, request: WriteChunkRequest) => {
    return projectStore.appendChunk(request.projectId, request.track, request.chunk);
  });

  ipcMain.handle(
    "recording:stop",
    async (_event, request: StopRecordingRequest) => {
      const project = await projectStore.stopRecording(request);
      activeRecordingProjectId = null;
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
      }
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle("ffmpeg:prepare-audio", async (_event, projectId: string) => {
    // Rewrite the recorded video containers with duration + seek cues so the
    // editor can seek them. A failed remux keeps the raw recording playable.
    for (const track of ["screen", "camera"] as const) {
      const mediaPath = projectStore.getMediaPath(projectId, track);
      if (mediaPath) {
        await remuxWebm(mediaPath).catch(() => undefined);
      }
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
    });
    await getProjectLibrary().upsert(project);
    return project;
  });
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

async function exportEditorVideo(
  request: ExportVideoRequest
): Promise<ExportVideoResult | null> {
  const source = resolveExportSource(request);
  const outputPath = await showExportPathDialog(getDialogParentWindow(), {
    format: request.format,
    name: source.name
  });

  if (!outputPath) {
    return null;
  }

  const bytesWritten = await exportVideo({
    videoPath: source.videoPath,
    audioPaths: [
      ...source.audioPaths,
      ...request.backgroundAudioImportIds.map(resolveImportedMediaPath)
    ],
    outputPath,
    format: request.format,
    resolution: request.resolution,
    trimStart: Math.max(0, request.trimStart),
    trimEnd:
      request.trimEnd && request.trimEnd > request.trimStart ? request.trimEnd : null,
    volume: request.volume,
    preserveSourceAudio: source.preserveSourceAudio
  });

  return {
    path: outputPath,
    bytesWritten
  };
}

function resolveExportSource(request: ExportVideoRequest): {
  name: string;
  videoPath: string;
  audioPaths: string[];
  preserveSourceAudio: boolean;
} {
  if (request.source.kind === "import") {
    return {
      name: path.basename(resolveImportedMediaPath(request.source.importId)),
      videoPath: resolveImportedMediaPath(request.source.importId),
      audioPaths: [],
      preserveSourceAudio: true
    };
  }

  const project = projectStore.getProject(request.source.projectId);
  const screenPath = projectStore.getMediaPath(request.source.projectId, "screen");

  if (!screenPath) {
    throw new Error("This project does not have a screen recording to export.");
  }

  const micPath =
    projectStore.getMediaPath(request.source.projectId, "micWav") ??
    projectStore.getMediaPath(request.source.projectId, "micWebm");

  return {
    name: project.name,
    videoPath: screenPath,
    audioPaths: micPath ? [micPath] : [],
    preserveSourceAudio: false
  };
}

function resolveImportedMediaPath(importId: string): string {
  const filePath = importedMediaCache.get(importId);

  if (!filePath) {
    throw new Error("Imported media is no longer available in this editing session.");
  }

  return filePath;
}

function toEditorProjectStateView(
  projectId: string,
  state: EditorProjectStateFile
): EditorProjectStateView {
  return {
    savedAt: state.savedAt,
    state: state.state,
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

function assertSaveEditorProjectStateRequest(
  value: unknown
): asserts value is SaveEditorProjectStateRequest {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Partial<SaveEditorProjectStateRequest>).projectId !== "string" ||
    !Array.isArray((value as Partial<SaveEditorProjectStateRequest>).imports)
  ) {
    throw new Error("Invalid editor save request.");
  }
}

function getDialogParentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? recorderWindow;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

app.whenReady().then(async () => {
  configureAppIdentity();
  Menu.setApplicationMenu(null);
  registerPermissionRequestHandlers({
    getMainWindow: () => mainWindow,
    getRecorderWindow: () => recorderWindow,
    getSelectedDisplaySource: () => selectedDisplaySource
  });
  registerCustomMediaProtocol({ projectStore, importedMediaCache });
  registerIpc();
  registerDisplayOverlayRefreshHandlers();
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    recorderWindow?.webContents.send("recording:global-stop");
  });
  await createWindow();
  startAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  void closeDisplayOverlay();
  closePermissionGuideWindow();
});

app.on("will-quit", () => {
  void closeDisplayOverlay();
  closePermissionGuideWindow();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  void closeDisplayOverlay();
  closePermissionGuideWindow();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
