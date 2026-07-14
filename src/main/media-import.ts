/** Pure media-import validation shared by dialog and drag/drop paths. */
import path from "node:path";
import type { ImportedMediaKind } from "../shared/types";

export const supportedMediaExtensions = [
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif"
] as const;

const supportedExtensionSet = new Set<string>(supportedMediaExtensions);

/**
 * Return a persistence-safe supported extension, or `null` before the import
 * is registered. This prevents an unsupported file from poisoning autosave.
 */
export function getSupportedMediaExtension(filePath: string): string | null {
  const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{1,12}$/u.test(extension) && supportedExtensionSet.has(extension)
    ? extension
    : null;
}

export function getImportedMediaKind(extension: string): ImportedMediaKind {
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
    return "audio";
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
    return "image";
  }

  return "video";
}
