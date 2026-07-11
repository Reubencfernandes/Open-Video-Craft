/**
 * Browser permission-request handlers (only app windows may capture media),
 * the display-media handler that selects the capture source and offers
 * loopback system audio, and macOS permission status/settings helpers.
 */
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
const appDragIconSize = {
  width: 40,
  height: 40
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

  // `audio: "loopback"` offers the system/desktop audio. It only produces a
  // track when the renderer's getDisplayMedia call also asks for audio, so the
  // renderer's "record system audio" toggle stays in full control. Loopback is
  // supported on Windows and on macOS 13+ (ScreenCaptureKit); where it is not,
  // the renderer falls back to a video-only capture.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const selectedDisplaySource = dependencies.getSelectedDisplaySource();
      if (!selectedDisplaySource) {
        callback({});
        return;
      }

      callback({
        video: {
          id: selectedDisplaySource.id,
          name: selectedDisplaySource.name
        },
        audio: "loopback"
      });
    },
    { useSystemPicker: false }
  );
}

export function getDesktopPermissionStatus(): DesktopPermissionStatus {
  if (process.platform === "win32") {
    // Windows grants desktop capture through the selected capture source, not a
    // macOS-style per-app Screen Recording permission. Camera and microphone
    // access are requested by Chromium at use time and can be restricted by OS
    // privacy policy, so Electron cannot reliably report a preflight state.
    return {
      platform: "win32",
      canDragAppBundle: false,
      screen: "unavailable",
      camera: "unavailable",
      microphone: "unavailable"
    };
  }

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

  const icon = createAppDragIcon(getAppIconPath);
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

function createAppDragIcon(getAppIconPath: () => string): Electron.NativeImage {
  const icon = nativeImage.createFromPath(getAppIconPath());
  return icon.isEmpty()
    ? icon
    : icon.resize({
        ...appDragIconSize,
        quality: "best"
      });
}
