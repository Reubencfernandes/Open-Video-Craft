/**
 * desktopCapturer source listing with fallbacks, plus an SVG placeholder
 * thumbnail for sources that cannot provide one.
 */
import { app, desktopCapturer } from "electron";

type CapturerSourceType = "screen" | "window";

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

export function createFallbackThumbnail(label: string): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#18181b"/><rect x="108" y="60" width="264" height="150" rx="10" fill="#27272a" stroke="#3f3f46" stroke-width="2"/><text x="240" y="236" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#d4d4d8">${safeLabel.slice(0, 36)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
