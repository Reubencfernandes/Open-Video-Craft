/**
 * desktopCapturer source listing with fallbacks, real still previews for the
 * recorder's multi-source grid, and the display-capture source reservation that
 * serializes getDisplayMedia calls.
 */
import { app, desktopCapturer } from "electron";

type CapturerSourceType = "screen" | "window";

/** Minimal source handle the capture handler needs. */
export interface ReservedDisplaySource {
  id: string;
  name: string;
}

// The main process hands exactly one reserved source to the next getDisplayMedia
// handler call. Selecting another screen while a reservation is still pending
// fails fast instead of silently recording the wrong display.
let reservedDisplayCaptureSource: ReservedDisplaySource | null = null;

export function reserveDisplayCaptureSource(source: ReservedDisplaySource): void {
  if (
    reservedDisplayCaptureSource &&
    reservedDisplayCaptureSource.id !== source.id
  ) {
    throw new Error(
      "Another display capture is already being prepared. Wait for it to finish before recording a different screen."
    );
  }

  reservedDisplayCaptureSource = { id: source.id, name: source.name };
}

export function releaseDisplayCaptureSource(): void {
  reservedDisplayCaptureSource = null;
}

/** Consume the reserved display source; the handler gets it exactly once. */
export function takeReservedDisplayCaptureSource(): ReservedDisplaySource | null {
  const source = reservedDisplayCaptureSource;
  reservedDisplayCaptureSource = null;
  return source;
}

export async function listDesktopCapturerSources(): Promise<Electron.DesktopCapturerSource[]> {
  const attempts: Array<{
    label: string;
    types: CapturerSourceType[];
    thumbnailSize: Electron.Size;
  }> = [
    {
      label: "screens and windows without thumbnails",
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 }
    },
    {
      label: "screens only without thumbnails",
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 }
    },
    {
      label: "screens only with minimal thumbnails",
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 }
    }
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await desktopCapturer.getSources({
        types: attempt.types,
        thumbnailSize: attempt.thumbnailSize,
        fetchWindowIcons: false
      });
    } catch (error) {
      lastError = error;
      console.warn(`Failed to list ${attempt.label}.`, error);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  if (process.platform === "darwin") {
    throw new Error(
      `Failed to get screen sources. Allow screen recording for ${app.getName()} in macOS System Settings > Privacy & Security > Screen & System Audio Recording, then restart the app. ${detail}`
    );
  }

  throw new Error(`Failed to get screen sources. ${detail}`);
}

/** Real still preview of one selected source; empty result means unavailable. */
export async function captureSourceThumbnail(
  sourceId: string,
  width = 480,
  height = 270
): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false
  });
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source) return null;
  const thumbnail = source.thumbnail;
  if (thumbnail.isEmpty()) return null;
  return `data:image/png;base64,${thumbnail.toPNG().toString("base64")}`;
}

/**
 * Real still previews for many sources in a single capturer pass, so the
 * recorder's source grid can show what every screen/window actually looks like
 * without one capturer per card. Sources that cannot provide a thumbnail are
 * omitted.
 */
export async function captureSourceThumbnails(
  sourceIds: string[],
  width = 480,
  height = 270
): Promise<Record<string, string>> {
  const requested = new Set(sourceIds);
  if (requested.size === 0) {
    return {};
  }

  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false
  });

  const thumbnails: Record<string, string> = {};
  for (const source of sources) {
    if (!requested.has(source.id) || source.thumbnail.isEmpty()) continue;
    thumbnails[source.id] = `data:image/png;base64,${source.thumbnail.toPNG().toString("base64")}`;
  }

  return thumbnails;
}

export function createFallbackThumbnail(label: string): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#18181b"/><rect x="108" y="60" width="264" height="150" rx="10" fill="#27272a" stroke="#3f3f46" stroke-width="2"/><text x="240" y="236" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#d4d4d8">${safeLabel.slice(0, 36)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
