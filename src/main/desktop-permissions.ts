import {
  app,
  nativeImage,
  session,
  shell,
  systemPreferences
} from "electron";
import path from "node:path";
import type {
  DesktopPermissionKind,
  DesktopPermissionState,
  DesktopPermissionStatus
} from "../shared/types";

interface PermissionHandlerDependencies {
  getMainWindow: () => Electron.BrowserWindow | null;
  getRecorderWindow: () => Electron.BrowserWindow | null;
  getSelectedDisplaySource: () => Electron.DesktopCapturerSource | null;
}

const macPermissionSettingsUrls: Record<DesktopPermissionKind, string> = {
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
};

// Electron asks the main process for every browser permission request. Only the
// app-owned windows can capture media, and only the selected display is exposed.
export function registerPermissionRequestHandlers(
  dependencies: PermissionHandlerDependencies
): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const isTrustedWindow =
      webContents === dependencies.getMainWindow()?.webContents ||
      webContents === dependencies.getRecorderWindow()?.webContents;

    if (isTrustedWindow && (permission === "media" || permission === "display-capture")) {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const selectedDisplaySource = dependencies.getSelectedDisplaySource();
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

export function getDesktopPermissionStatus(): DesktopPermissionStatus {
  if (process.platform !== "darwin") {
    return {
      platform: getPermissionPlatform(),
      canDragAppBundle: false,
      screen: "unavailable",
      camera: "unavailable",
      microphone: "unavailable"
    };
  }

  return {
    platform: "darwin",
    canDragAppBundle: getAppBundlePath() !== null,
    screen: getMacPermissionState("screen"),
    camera: getMacPermissionState("camera"),
    microphone: getMacPermissionState("microphone")
  };
}

export function assertDesktopPermissionKind(value: unknown): DesktopPermissionKind {
  if (value === "screen" || value === "camera" || value === "microphone") {
    return value;
  }

  throw new Error("Unknown permission type.");
}

export function assertMediaPermissionKind(
  value: unknown
): Extract<DesktopPermissionKind, "camera" | "microphone"> {
  if (value === "camera" || value === "microphone") {
    return value;
  }

  throw new Error("Only camera and microphone permissions can be requested directly.");
}

export async function openPermissionSettings(kind: DesktopPermissionKind): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }

  await shell.openExternal(macPermissionSettingsUrls[kind]);
  return true;
}

export async function requestMediaPermission(
  kind: Extract<DesktopPermissionKind, "camera" | "microphone">
): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }

  return systemPreferences.askForMediaAccess(kind);
}

export function startAppBundleDrag(
  event: Electron.IpcMainEvent,
  getAppIconPath: () => string
): void {
  const appBundlePath = getAppBundlePath();

  if (!appBundlePath) {
    return;
  }

  const icon = nativeImage.createFromPath(getAppIconPath());
  event.sender.startDrag({
    file: appBundlePath,
    icon: icon.isEmpty() ? getAppIconPath() : icon
  });
}

export function revealAppBundleInFinder(): boolean {
  const appBundlePath = getAppBundlePath();

  if (!appBundlePath) {
    return false;
  }

  shell.showItemInFolder(appBundlePath);
  return true;
}

function getPermissionPlatform(): DesktopPermissionStatus["platform"] {
  if (process.platform === "darwin" || process.platform === "win32" || process.platform === "linux") {
    return process.platform;
  }

  return "other";
}

function getMacPermissionState(kind: DesktopPermissionKind): DesktopPermissionState {
  try {
    return systemPreferences.getMediaAccessStatus(kind);
  } catch (error) {
    console.warn(`Failed to read ${kind} permission status.`, error);
    return "unknown";
  }
}

function getAppBundlePath(): string | null {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return null;
  }

  const contentsMarker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = process.execPath.indexOf(contentsMarker);
  return markerIndex > 0 ? process.execPath.slice(0, markerIndex) : null;
}
