import { app, BrowserWindow, dialog } from "electron";
import type { MessageBoxOptions } from "electron";
import { autoUpdater } from "electron-updater";

const STARTUP_UPDATE_CHECK_DELAY_MS = 5_000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

let updateCheckDelay: NodeJS.Timeout | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;
let updateCheckRunning = false;
let updateDownloaded = false;
let restartPromptOpen = false;
let autoUpdatesStarted = false;

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
    updateLogger.info("Skipping update checks in development.");
    return;
  }

  updateCheckDelay = setTimeout(() => {
    void checkForAppUpdates("startup");
  }, STARTUP_UPDATE_CHECK_DELAY_MS);

  updateCheckInterval = setInterval(() => {
    void checkForAppUpdates("scheduled");
  }, UPDATE_CHECK_INTERVAL_MS);

  app.once("will-quit", stopAutoUpdates);
}

export async function checkForAppUpdates(reason = "manual"): Promise<boolean> {
  if (!app.isPackaged || updateCheckRunning || updateDownloaded) {
    return false;
  }

  updateCheckRunning = true;

  try {
    updateLogger.info(`Checking for updates (${reason}).`);
    const result = await autoUpdater.checkForUpdates();
    return Boolean(result?.isUpdateAvailable);
  } catch (error) {
    updateLogger.warn(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    updateCheckRunning = false;
  }
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
    updateLogger.info("Checking for an available update.");
  });

  autoUpdater.on("update-available", (info) => {
    updateLogger.info(`Update ${info.version} is available. Downloading.`);
  });

  autoUpdater.on("update-not-available", (info) => {
    updateLogger.info(`No update available. Latest version: ${info.version}.`);
  });

  autoUpdater.on("download-progress", (progress) => {
    updateLogger.info(`Downloaded ${progress.percent.toFixed(1)}% of the update.`);
  });

  autoUpdater.on("update-downloaded", (event) => {
    updateDownloaded = true;
    void promptToRestartForUpdate(event.version);
  });

  autoUpdater.on("error", (error) => {
    updateLogger.error(error instanceof Error ? error.message : String(error));
  });
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
