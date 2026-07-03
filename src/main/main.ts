import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  protocol,
  screen as electronScreen,
  session
} from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { convertWebmAudioToWav, exportVideo, getFfmpegStatus, remuxWebm } from "./ffmpeg";
import { ProjectLibrary } from "./project-library";
import { ProjectStore } from "./project-store";
import type {
  CreateProjectRequest,
  ExportVideoRequest,
  ExportVideoResult,
  FailRecordingRequest,
  ImportedMediaFile,
  ImportedMediaKind,
  ProjectView,
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
      stream: true
    }
  },
  {
    scheme: "ovc-import",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

const projectStore = new ProjectStore({
  appVersion: app.getVersion()
});

const sourceCache = new Map<string, Electron.DesktopCapturerSource>();
const importedMediaCache = new Map<string, string>();
const appId = "com.openvideocraft.app";
let selectedDisplaySource: Electron.DesktopCapturerSource | null = null;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let displayOverlayWindow: BrowserWindow | null = null;
let projectLibrary: ProjectLibrary | null = null;

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

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.png")
    : path.join(__dirname, "../../src/renderer/assets/app.png");
}

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
    closeDisplayOverlay();
  });
  attachDevToolsShortcuts(mainWindow);

  await loadRendererView(mainWindow, "main");
}

function registerPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const isTrustedWindow =
      webContents === mainWindow?.webContents || webContents === recorderWindow?.webContents;

    if (isTrustedWindow && (permission === "media" || permission === "display-capture")) {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (!selectedDisplaySource) {
      callback({});
      return;
    }

    callback({
      video: {
        id: selectedDisplaySource.id,
        name: selectedDisplaySource.name
      }
    });
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
    alwaysOnTop: true,
    skipTaskbar: true,
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
  recorderWindow.setContentProtection(true);
  recorderWindow.on("closed", () => {
    recorderWindow = null;
    closeDisplayOverlay();
  });
  attachDevToolsShortcuts(recorderWindow);

  await loadRendererView(recorderWindow, "controller");
}

async function loadRendererView(
  window: BrowserWindow,
  view: "main" | "controller" | "display-border" | "editor",
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
      closeDisplayOverlay();
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
    closeDisplayOverlay();
    return {
      shown: false,
      reason: "Selected source is no longer available."
    };
  }

  if (!source.id.startsWith("screen:")) {
    closeDisplayOverlay();
    return {
      shown: false,
      reason: "Display border is only shown for full-screen sources."
    };
  }

  const display = getDisplayForSource(source);
  closeDisplayOverlay();

  const overlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  displayOverlayWindow = overlayWindow;

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Visible on screen while recording, but never captured into the video.
  overlayWindow.setContentProtection(true);
  overlayWindow.on("closed", () => {
    if (displayOverlayWindow === overlayWindow) {
      displayOverlayWindow = null;
    }
  });

  try {
    await loadRendererView(overlayWindow, "display-border", {
      label: source.name || "Primary Display"
    });
  } catch (error) {
    if (overlayWindow.isDestroyed()) {
      // A hide closed the window while it was still loading.
      return {
        shown: false,
        reason: null
      };
    }

    throw error;
  }

  return {
    shown: true,
    reason: null
  };
}

function closeDisplayOverlay(): void {
  if (displayOverlayWindow && !displayOverlayWindow.isDestroyed()) {
    displayOverlayWindow.close();
  }

  displayOverlayWindow = null;
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

function getDisplayForSource(source: Electron.DesktopCapturerSource): Electron.Display {
  const displays = electronScreen.getAllDisplays();

  if (source.display_id) {
    const display = displays.find((item) => String(item.id) === source.display_id);

    if (display) {
      return display;
    }
  }

  const idParts = source.id.split(":");
  const numericId = idParts.find((part) => /^\d+$/.test(part));

  if (numericId) {
    const display = displays.find((item) => String(item.id) === numericId);

    if (display) {
      return display;
    }
  }

  return electronScreen.getPrimaryDisplay();
}

function registerMediaProtocol(): void {
  protocol.handle("ovc-media", async (request) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const [projectId, ...relativePathSegments] = pathSegments;

      if (url.hostname !== "project" || !projectId || relativePathSegments.length === 0) {
        return new Response("Not found", { status: 404 });
      }

      const filePath = projectStore.resolveProjectFile(
        projectId,
        relativePathSegments.join(path.sep)
      );

      // Forward headers so Range requests work; media seeking depends on it.
      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });

  protocol.handle("ovc-import", async (request) => {
    try {
      const url = new URL(request.url);
      const id = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)[0];
      const filePath = id ? importedMediaCache.get(id) : null;

      if (url.hostname !== "file" || !filePath) {
        return new Response("Not found", { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });
}

function registerIpc(): void {
  ipcMain.handle("sources:list", async (): Promise<SourceSummary[]> => {
    // Request sources without live thumbnails or window icons. Capturing a
    // thumbnail per source forces Windows Graphics Capture to start a capturer
    // for every window, which floods the log with "Failed to start capture"
    // (E_INVALIDARG / -2147024809) for windows it cannot grab. The recorder UI
    // never renders these, so we substitute a lightweight fallback thumbnail.
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: {
        width: 0,
        height: 0
      },
      fetchWindowIcons: false
    });

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
    BrowserWindow.fromWebContents(event.sender)?.minimize();
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
    return importMediaFiles();
  });

  ipcMain.handle("editor:remove-imported-media", (_event, importId: string): boolean => {
    return importedMediaCache.delete(importId);
  });

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
    return enqueueOverlayOp(() => {
      closeDisplayOverlay();
      return true;
    });
  });

  ipcMain.handle("projects:choose-base-directory", async (): Promise<string | null> => {
    return chooseBaseDirectory();
  });

  ipcMain.handle("projects:list-recent", async () => {
    return getProjectLibrary().listRecent();
  });

  ipcMain.handle("projects:get", async (_event, projectId: string) => {
    return getProjectForEditor(projectId);
  });

  ipcMain.handle("projects:open-existing-project-folder", async (): Promise<ProjectView | null> => {
    const projectRootPath = await chooseExistingProjectFolder();
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
        baseDirectory = await chooseBaseDirectory();

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
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle(
    "recording:fail",
    async (_event, request: FailRecordingRequest) => {
      const project = await projectStore.markFailed(request);
      await getProjectLibrary().upsert(project);
      return project;
    }
  );

  ipcMain.handle("ffmpeg:status", async () => getFfmpegStatus());

  ipcMain.handle("ffmpeg:prepare-audio", async (_event, projectId: string) => {
    // Rewrite the recorded video containers with duration + seek cues so the
    // editor can seek them. A failed remux keeps the raw recording playable.
    for (const track of ["screen", "camera"] as const) {
      const mediaPath = projectStore.getMediaPath(projectId, track);
      if (mediaPath) {
        await remuxWebm(mediaPath).catch(() => undefined);
      }
    }

    const inputPath = projectStore.getMicWebmPath(projectId);

    if (!inputPath) {
      const project = await projectStore.completeAudio(projectId, 0);
      await getProjectLibrary().upsert(project);
      return project;
    }

    const outputPath = projectStore.getMicWavPath(projectId);
    const bytesWritten = await convertWebmAudioToWav(inputPath, outputPath);
    const project = await projectStore.completeAudio(projectId, bytesWritten);
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

async function chooseBaseDirectory(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Choose where Open Video Craft should save this project",
    properties: ["openDirectory", "createDirectory"]
  };
  const parentWindow = BrowserWindow.getFocusedWindow() ?? recorderWindow ?? mainWindow;
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function chooseExistingProjectFolder(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Open an Open Video Craft project folder",
    properties: ["openDirectory"]
  };
  const parentWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? recorderWindow;
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function importMediaFiles(): Promise<ImportedMediaFile[]> {
  const options: Electron.OpenDialogOptions = {
    title: "Import media into Open Video Craft",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: [
          "mp4",
          "mov",
          "mkv",
          "webm",
          "avi",
          "mp3",
          "wav",
          "m4a",
          "aac",
          "ogg",
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif"
        ]
      },
      { name: "All Files", extensions: ["*"] }
    ]
  };
  const parentWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? recorderWindow;
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map((filePath) => {
    const id = randomUUID();
    importedMediaCache.set(id, filePath);
    const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();

    return {
      id,
      name: path.basename(filePath),
      path: filePath,
      url: `ovc-import://file/${encodeURIComponent(id)}`,
      kind: getImportedMediaKind(extension),
      extension
    };
  });
}

async function exportEditorVideo(
  request: ExportVideoRequest
): Promise<ExportVideoResult | null> {
  const source = resolveExportSource(request);
  const outputPath = await chooseExportPath({
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

async function chooseExportPath(input: {
  format: ExportVideoRequest["format"];
  name: string;
}): Promise<string | null> {
  const extension = input.format;
  const parentWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? recorderWindow;
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, createExportDialogOptions(input.name, extension))
    : await dialog.showSaveDialog(createExportDialogOptions(input.name, extension));

  if (result.canceled || !result.filePath) {
    return null;
  }

  return path.extname(result.filePath).toLowerCase() === `.${extension}`
    ? result.filePath
    : `${result.filePath}.${extension}`;
}

function createExportDialogOptions(
  name: string,
  extension: ExportVideoRequest["format"]
): Electron.SaveDialogOptions {
  return {
    title: "Export video",
    defaultPath: `${slugForFileName(name)}.${extension}`,
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: "Video", extensions: ["mp4", "webm", "mov"] }
    ]
  };
}

function resolveImportedMediaPath(importId: string): string {
  const filePath = importedMediaCache.get(importId);

  if (!filePath) {
    throw new Error("Imported media is no longer available in this editing session.");
  }

  return filePath;
}

function slugForFileName(value: string): string {
  const safeValue = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return safeValue || "open-video-craft-export";
}

function getImportedMediaKind(extension: string): ImportedMediaKind {
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
    return "audio";
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
    return "image";
  }

  return "video";
}

function createFallbackThumbnail(label: string): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#18181b"/><rect x="108" y="60" width="264" height="150" rx="10" fill="#27272a" stroke="#3f3f46" stroke-width="2"/><text x="240" y="236" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#d4d4d8">${safeLabel.slice(0, 36)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

app.whenReady().then(async () => {
  app.setAppUserModelId(appId);
  Menu.setApplicationMenu(null);
  registerPermissions();
  registerMediaProtocol();
  registerIpc();
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    recorderWindow?.webContents.send("recording:global-stop");
  });
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  closeDisplayOverlay();
});

app.on("will-quit", () => {
  closeDisplayOverlay();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  closeDisplayOverlay();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
