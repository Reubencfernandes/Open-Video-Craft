/**
 * Font files used to burn text overlays into an export.
 *
 * The renderer draws overlays with CSS, FFmpeg draws them with `drawtext`, and
 * the two only agree if both use the same file. Inter is bundled for exactly
 * that reason: `drawtext` has no synthetic bold, so each weight the editor
 * offers needs its own font file, and relying on a system font would make the
 * same project export differently on macOS and Windows.
 *
 * Deliberately free of electron imports so the export pipeline stays testable
 * outside a packaged app.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { TextOverlay } from "../shared/editor-domain";

/** Bundled weights, matching the editor's weight control. */
const interFileByWeight: Record<TextOverlay["weight"], string> = {
  400: "Inter-Regular.ttf",
  600: "Inter-SemiBold.ttf",
  700: "Inter-Bold.ttf",
  800: "Inter-ExtraBold.ttf"
};

/**
 * Only the "sans" family is bundled. The others resolve through fontconfig by
 * name, which is why they can still drift from the preview -- see
 * `createTextOverlayFontArgument`.
 */
const fontconfigNameByFamily: Record<NonNullable<TextOverlay["fontFamily"]>, string | null> = {
  sans: null,
  rounded: "Trebuchet MS",
  serif: "serif",
  mono: "monospace"
};

let cachedFontsDirectory: string | null | undefined;

/**
 * `resources/fonts` in a checkout, `<resources>/fonts` once electron-builder
 * has copied it via extraResources. Probing the packaged location first keeps
 * this working without an `app.isPackaged` check, which would drag electron in.
 */
export function resolveFontsDirectory(): string | null {
  if (cachedFontsDirectory !== undefined) {
    return cachedFontsDirectory;
  }

  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "fonts") : null,
    // dist-electron/main/overlay-fonts.js -> repository root
    path.join(__dirname, "..", "..", "resources", "fonts")
  ];
  cachedFontsDirectory = candidates.find(
    (candidate): candidate is string => Boolean(candidate) && existsSync(candidate!)
  ) ?? null;
  return cachedFontsDirectory;
}

/** Absolute path to the bundled Inter file for a weight, when available. */
export function resolveOverlayFontFile(weight: TextOverlay["weight"]): string | null {
  const directory = resolveFontsDirectory();
  if (!directory) return null;
  const filePath = path.join(directory, interFileByWeight[weight] ?? interFileByWeight[400]);
  return existsSync(filePath) ? filePath : null;
}

/**
 * The `fontfile`/`font` half of a drawtext filter.
 *
 * A bundled file is preferred because it pins both the typeface and the weight.
 * Without one -- a non-sans family, or a checkout missing `resources/fonts` --
 * this falls back to a fontconfig family name, which renders but ignores
 * weight, exactly as it did before Inter was bundled.
 */
export function createTextOverlayFontArgument(
  overlay: Pick<TextOverlay, "weight"> & Partial<Pick<TextOverlay, "fontFamily">>
): string {
  const family = overlay.fontFamily ?? "sans";
  const fontconfigName = fontconfigNameByFamily[family];

  if (fontconfigName === null) {
    const fontFile = resolveOverlayFontFile(overlay.weight);
    if (fontFile) {
      return `fontfile='${escapeFontPath(fontFile)}'`;
    }
  }

  return `font='${fontconfigName ?? "sans-serif"}'`;
}

/**
 * drawtext option values are colon-separated and single-quoted, and FFmpeg
 * reads a backslash as an escape on Windows paths too.
 */
function escapeFontPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

/** Reset the cached lookup. Tests only. */
export function resetFontsDirectoryCache(): void {
  cachedFontsDirectory = undefined;
}
