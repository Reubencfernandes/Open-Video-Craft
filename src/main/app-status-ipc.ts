/**
 * IPC handlers exposing the app version and auto-update status to renderers.
 */
import { app, ipcMain, shell } from "electron";
import {
  checkForAppUpdates,
  getAutoUpdateStatus,
  installDownloadedUpdate
} from "./auto-updates";
import { getProductVersion } from "./app-version";
import type { AppInfo, UpdateStatus } from "../shared/types";

// Renderer windows read app metadata and update progress through this small IPC
// surface instead of importing Electron or electron-updater directly.
export function registerAppStatusIpc(): void {
  ipcMain.handle("app:get-info", (): AppInfo => {
    return {
      version: getProductVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform
    };
  });

  ipcMain.handle("app:open-external", async (_event, value: unknown): Promise<boolean> => {
    if (typeof value !== "string") throw new Error("External URL is required.");
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Only HTTP and HTTPS links can be opened.");
    }
    await shell.openExternal(url.toString());
    return true;
  });

  ipcMain.handle("updates:get-status", (): UpdateStatus => {
    return getAutoUpdateStatus();
  });

  ipcMain.handle("updates:check", async (): Promise<UpdateStatus> => {
    await checkForAppUpdates("manual");
    return getAutoUpdateStatus();
  });

  ipcMain.handle("updates:install", (): boolean => {
    return installDownloadedUpdate();
  });
}
