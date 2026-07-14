/** Persists the preview-quality preference without adding state to EditorView. */
import { useState } from "react";
import {
  readPreviewQuality,
  writePreviewQuality,
  type PreviewQuality
} from "./preview-quality";

export function usePreviewQuality() {
  const [quality, setQualityState] = useState<PreviewQuality>(() =>
    readPreviewQuality(window.localStorage)
  );

  function setQuality(nextQuality: PreviewQuality) {
    setQualityState(nextQuality);
    writePreviewQuality(window.localStorage, nextQuality);
  }

  return { quality, setQuality };
}
