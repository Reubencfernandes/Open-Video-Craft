/** Applies denoised preview URLs only to audio media, never to video items. */
import type { EditorMediaItem } from "./types";

export function applyCleanupPreviewUrls(
  importedMedia: readonly EditorMediaItem[],
  cleanupPreviews: Readonly<Record<string, { key: string; url: string }>>
): EditorMediaItem[] {
  return importedMedia.map((item) => {
    const preview = item.kind === "audio" ? cleanupPreviews[item.id] : undefined;
    return preview ? { ...item, url: preview.url } : item;
  });
}
