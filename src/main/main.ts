import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  screen as electronScreen,
  session
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { convertWebmAudioToWav, getFfmpegStatus } from "./ffmpeg";
import { ProjectStore } from "./project-store";
import type {
  CreateProjectRequest,
  FailRecordingRequest,
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
  }
]);

const projectStore = new ProjectStore({
  appVersion: app.getVersion()
});

const sourceCache = new Map<string, Electron.DesktopCapturerSource>();
let selectedDisplaySource: Electron.DesktopCapturerSource | null = null;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let displayOverlayWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: "Open Video Craft",
    backgroundColor: "#101114",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await loadRendererView(mainWindow, "main");

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
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
    width: 460,
    height: 560,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Open Video Craft Recorder",
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

  await loadRendererView(recorderWindow, "controller");
}

async function loadRendererView(
  window: BrowserWindow,
  view: "main" | "controller" | "display-border",
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

async function showDisplayOverlay(sourceId: string): Promise<SourceOverlayResult> {
  const source = sourceCache.get(sourceId);

  if (!source) {
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

  displayOverlayWindow = new BrowserWindow({
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

  displayOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  displayOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  displayOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  displayOverlayWindow.on("closed", () => {
    displayOverlayWindow = null;
  });

  await loadRendererView(displayOverlayWindow, "display-border", {
    label: source.name || "Primary Display"
  });

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

      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });
}

function registerIpc(): void {
  ipcMain.handle("sources:list", async (): Promise<SourceSummary[]> => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: {
        width: 480,
        height: 270
      },
      fetchWindowIcons: true
    });

    sourceCache.clear();
    return sources.map((source) => {
      sourceCache.set(source.id, source);
      const thumbnail = source.thumbnail?.isEmpty()
        ? createFallbackThumbnail(source.name)
        : source.thumbnail?.toDataURL() ?? createFallbackThumbnail(source.name);
      const appIcon = source.appIcon?.isEmpty()
        ? null
        : source.appIcon?.toDataURL() ?? null;

      return {
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        displayId: source.display_id,
        thumbnail,
        appIcon
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

  ipcMain.handle("overlays:show-source-border", async (_event, sourceId: string) => {
    return showDisplayOverlay(sourceId);
  });

  ipcMain.handle("overlays:hide-source-border", (): boolean => {
    closeDisplayOverlay();
    return true;
  });

  ipcMain.handle("projects:choose-base-directory", async (): Promise<string | null> => {
    return chooseBaseDirectory();
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

      return projectStore.createProject({
        name: request.name,
        baseDirectory
      });
    }
  );

  ipcMain.handle(
    "recording:start",
    async (_event, request: StartRecordingRequest) => projectStore.startRecording(request)
  );

  ipcMain.handle("recording:write-chunk", async (_event, request: WriteChunkRequest) => {
    return projectStore.appendChunk(request.projectId, request.track, request.chunk);
  });

  ipcMain.handle(
    "recording:stop",
    async (_event, request: StopRecordingRequest) => projectStore.stopRecording(request)
  );

  ipcMain.handle(
    "recording:fail",
    async (_event, request: FailRecordingRequest) => projectStore.markFailed(request)
  );

  ipcMain.handle("ffmpeg:status", async () => getFfmpegStatus());

  ipcMain.handle("ffmpeg:prepare-audio", async (_event, projectId: string) => {
    const inputPath = projectStore.getMicWebmPath(projectId);

    if (!inputPath) {
      return projectStore.completeAudio(projectId, 0);
    }

    const outputPath = projectStore.getMicWavPath(projectId);
    const bytesWritten = await convertWebmAudioToWav(inputPath, outputPath);
    return projectStore.completeAudio(projectId, bytesWritten);
  });
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

function createFallbackThumbnail(label: string): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#18181b"/><rect x="108" y="60" width="264" height="150" rx="10" fill="#27272a" stroke="#3f3f46" stroke-width="2"/><text x="240" y="236" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#d4d4d8">${safeLabel.slice(0, 36)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

app.whenReady().then(async () => {
  registerPermissions();
  registerMediaProtocol();
  registerIpc();
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    recorderWindow?.webContents.send("recording:global-stop");
  });
  await createRecorderWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createRecorderWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
