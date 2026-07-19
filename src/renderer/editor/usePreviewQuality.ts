/** Persists the preview-quality preference without adding state to EditorView. */
import { useCallback, useState } from "react";
import {
  readPreviewQuality,
  writePreviewQuality,
  type PreviewQuality
} from "./preview-quality";

export function usePreviewQuality() {
  const [quality, setQualityState] = useState<PreviewQuality>(() =>
    readPreviewQuality(window.localStorage)
  );

  const setQuality = useCallback((nextQuality: PreviewQuality) => {
    setQualityState(nextQuality);
    writePreviewQuality(window.localStorage, nextQuality);
  }, []);

  return { quality, setQuality };
}
