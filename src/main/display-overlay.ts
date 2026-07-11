/**
 * Pure geometry for the recording-border overlay: resolving which display a
 * capture source belongs to and computing the border strip bounds.
 */
export interface DisplayOverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayForOverlay {
  id: number | string;
  bounds: DisplayOverlayBounds;
  scaleFactor: number;
}

export interface CaptureSourceForOverlay {
  id: string;
  displayId: string;
}

/**
 * `DesktopCapturerSource.display_id` is the only authoritative display match.
 * The number in `screen:NN:0` is a sequential capture-source number, not a
 * Display id, so it is used only as a fallback index when that id is absent.
 */
export function resolveDisplayForOverlay<T extends DisplayForOverlay>(
  source: CaptureSourceForOverlay,
  displays: readonly T[],
  primaryDisplay: T
): T | null {
  if (source.displayId) {
    return displays.find((display) => String(display.id) === source.displayId) ?? null;
  }

  const sourceIndex = getScreenSourceIndex(source.id);
  if (sourceIndex !== null && sourceIndex < displays.length) {
    return displays[sourceIndex];
  }

  return displays.length === 1 ? primaryDisplay : null;
}

export function getDisplayOverlayStripBounds(
  display: Pick<DisplayForOverlay, "bounds" | "scaleFactor">,
  platform: NodeJS.Platform
): DisplayOverlayBounds[] {
  const { x, y, width, height } = display.bounds;
  const thickness = getOverlayThickness(display.scaleFactor, platform);

  return [
    { x, y, width, height: thickness },
    { x, y: y + height - thickness, width, height: thickness },
    { x, y: y + thickness, width: thickness, height: height - thickness * 2 },
    { x: x + width - thickness, y: y + thickness, width: thickness, height: height - thickness * 2 }
  ];
}

function getScreenSourceIndex(sourceId: string): number | null {
  const match = /^screen:(\d+):/u.exec(sourceId);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getOverlayThickness(scaleFactor: number, platform: NodeJS.Platform): number {
  if (platform !== "win32") {
    return 6;
  }

  // BrowserWindow and Screen bounds are both in DIP. Convert the Windows border
  // to a stable four physical pixels so it does not become oversized at 150–200%.
  return Math.max(1, Math.round(4 / Math.max(1, scaleFactor)));
}
