/** User-selectable viewport rendering quality. Source media is never changed. */
export type PreviewQuality = "high" | "low";

export const lowQualityPreviewMaxEdge = 640;
export const previewQualityStorageKey = "open-video-craft:preview-quality";

export function readPreviewQuality(
  storage: Pick<Storage, "getItem"> | null
): PreviewQuality {
  const saved = storage?.getItem(previewQualityStorageKey);
  return saved === "low" ? "low" : "high";
}

export function writePreviewQuality(
  storage: Pick<Storage, "setItem"> | null,
  quality: PreviewQuality
): void {
  storage?.setItem(previewQualityStorageKey, quality);
}
