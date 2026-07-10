import { app, BrowserWindow, dialog } from "electron";
import type { MessageBoxOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { getProductVersion } from "./app-version";
import type { UpdateStatus } from "../shared/types";

const STARTUP_UPDATE_CHECK_DELAY_MS = 5_000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

let updateCheckDelay: NodeJS.Timeout | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;
let updateCheckRunning = false;
let updateDownloaded = false;
let restartPromptOpen = false;
let autoUpdatesStarted = false;
let updateStatus: UpdateStatus = createInitialUpdateStatus();

const updateLogger = {
  info(message?: unknown) {
    console.info("[auto-update]", message);
  },
  warn(message?: unknown) {
    console.warn("[auto-update]", message);
  },
  error(message?: unknown) {
    console.error("[auto-update]", message);
  }
};

export function startAutoUpdates(): void {
  if (autoUpdatesStarted) {
    return;
  }

  autoUpdatesStarted = true;
  configureAutoUpdater();
  registerAutoUpdateEvents();

  if (!app.isPackaged) {
    setUpdateStatus({
      state: "disabled",
      message: "Updates run in the installed app.",
      isPackaged: app.isPackaged
    });
    updateLogger.info("Skipping update checks in development.");
    return;
  }

  setUpdateStatus({
    state: "idle",
    message: "Will check for updates shortly.",
    isPackaged: app.isPackaged
  });

  updateCheckDelay = setTimeout(() => {
    void checkForAppUpdates("startup");
  }, STARTUP_UPDATE_CHECK_DELAY_MS);

  updateCheckInterval = setInterval(() => {
    void checkForAppUpdates("scheduled");
  }, UPDATE_CHECK_INTERVAL_MS);

  app.once("will-quit", stopAutoUpdates);
}

export async function checkForAppUpdates(reason = "manual"): Promise<boolean> {
  if (!app.isPackaged) {
    setUpdateStatus({
      state: "disabled",
      message: "Updates run in the installed app.",
      isPackaged: app.isPackaged
    });
    return false;
  }

  if (updateCheckRunning || updateDownloaded) {
    return false;
  }

  updateCheckRunning = true;

  try {
    setUpdateStatus({
      state: "checking",
      message: "Checking for updates...",
      checkedAt: new Date().toISOString(),
      downloadProgress: null
    });
    updateLogger.info(`Checking for updates (${reason}).`);
    const result = await autoUpdater.checkForUpdates();
    return Boolean(result?.isUpdateAvailable);
  } catch (error) {
    const message = getUpdateErrorMessage(error);
    setUpdateStatus({
      state: "error",
      message,
      checkedAt: new Date().toISOString(),
      downloadProgress: null
    });
    updateLogger.warn(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    updateCheckRunning = false;
  }
}

export function getAutoUpdateStatus(): UpdateStatus {
  return { ...updateStatus };
}

export function installDownloadedUpdate(): boolean {
  if (!updateDownloaded) {
    return false;
  }

  autoUpdater.quitAndInstall(false, true);
  return true;
}

function configureAutoUpdater(): void {
  autoUpdater.logger = updateLogger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.fullChangelog = false;
}

function registerAutoUpdateEvents(): void {
  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      message: "Checking for updates...",
      checkedAt: new Date().toISOString(),
      downloadProgress: null
    });
    updateLogger.info("Checking for an available update.");
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateStatus({
      state: "available",
      latestVersion: info.version,
      message: `Update ${info.version} is available. Downloading...`,
      checkedAt: new Date().toISOString(),
      downloadProgress: null
    });
    updateLogger.info(`Update ${info.version} is available. Downloading.`);
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateStatus({
      state: "not-available",
      latestVersion: info.version,
      message: "Up to date.",
      checkedAt: new Date().toISOString(),
      downloadProgress: null
    });
    updateLogger.info(`No update available. Latest version: ${info.version}.`);
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateStatus({
      state: "downloading",
      message: `Downloading update ${progress.percent.toFixed(0)}%...`,
      downloadProgress: progress.percent
    });
    updateLogger.info(`Downloaded ${progress.percent.toFixed(1)}% of the update.`);
  });

  autoUpdater.on("update-downloaded", (event) => {
    updateDownloaded = true;
    setUpdateStatus({
      state: "downloaded",
      latestVersion: event.version,
      message: `Update ${event.version} is ready to install.`,
      checkedAt: new Date().toISOString(),
      downloadProgress: 100
    });
    void promptToRestartForUpdate(event.version);
  });

  autoUpdater.on("error", (error) => {
    const message = getUpdateErrorMessage(error);
    setUpdateStatus({
      state: "error",
      message,
      checkedAt: new Date().toISOString()
    });
    updateLogger.error(error instanceof Error ? error.message : String(error));
  });
}

function getUpdateErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (process.platform === "darwin" && /code signature|specified code requirement/i.test(rawMessage)) {
    return "The downloaded macOS update did not pass signature verification. Install the latest signed release manually, then future updates will work normally.";
  }

  return rawMessage;
}

function createInitialUpdateStatus(): UpdateStatus {
  return {
    state: app.isPackaged ? "idle" : "disabled",
    currentVersion: getProductVersion(),
    latestVersion: null,
    message: app.isPackaged ? "Updates have not been checked yet." : "Updates run in the installed app.",
    checkedAt: null,
    downloadProgress: null,
    isPackaged: app.isPackaged
  };
}

function setUpdateStatus(updates: Partial<UpdateStatus>): void {
  updateStatus = {
    ...updateStatus,
    currentVersion: getProductVersion(),
    isPackaged: app.isPackaged,
    ...updates
  };
  broadcastUpdateStatus();
}

function broadcastUpdateStatus(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("updates:status", updateStatus);
    }
  }
}

async function promptToRestartForUpdate(version: string): Promise<void> {
  if (restartPromptOpen) {
    return;
  }

  restartPromptOpen = true;

  try {
    const parentWindow = getDialogParentWindow();
    const options: MessageBoxOptions = {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Open Video Craft ${version} is ready to install.`,
      detail: "Restart now to finish updating. If you choose Later, the update will install when you quit the app."
    };
    const { response } = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  } finally {
    restartPromptOpen = false;
  }
}

function getDialogParentWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed() && window.isVisible()) ??
    null
  );
}

function stopAutoUpdates(): void {
  if (updateCheckDelay) {
    clearTimeout(updateCheckDelay);
    updateCheckDelay = null;
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}
