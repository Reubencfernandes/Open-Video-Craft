/**
 * Shared, deduplicated video-thumbnail cache. The Setup/media grid and the
 * timeline both want a poster frame for the same recording URL; capturing it
 * once here keeps them in sync and avoids decoding the same file repeatedly
 * (a recording split into several timeline clips reuses one capture).
 */
import { useEffect, useState } from "react";
import type { ImportedMediaKind } from "../../shared/types";
import { captureVideoPoster, type VideoPoster } from "./media-utils";

const posterCache = new Map<string, Promise<VideoPoster>>();

export function loadVideoPoster(url: string): Promise<VideoPoster> {
  const cached = posterCache.get(url);
  if (cached) {
    return cached;
  }

  const pending = captureVideoPoster(url);
  posterCache.set(url, pending);
  // Evict failures so a later mount (e.g. after a remux finishes writing seek
  // cues, or once the file is fully flushed) can retry instead of caching the
  // placeholder forever.
  void pending.catch(() => posterCache.delete(url));
  return pending;
}

export interface MediaThumbnail {
  thumbnailUrl: string | null;
  duration: number | null;
}

// Resolves a thumbnail image for any media item: images use their own URL,
// videos decode a poster frame (once, via the shared cache), and audio has no
// thumbnail. Returns null until a video poster is ready.
export function useMediaThumbnail(item: {
  url: string;
  kind: ImportedMediaKind;
}): MediaThumbnail {
  const [thumbnail, setThumbnail] = useState<MediaThumbnail>({
    thumbnailUrl: null,
    duration: null
  });

  useEffect(() => {
    if (item.kind === "image") {
      setThumbnail({ thumbnailUrl: item.url, duration: null });
      return;
    }

    if (item.kind !== "video") {
      setThumbnail({ thumbnailUrl: null, duration: null });
      return;
    }

    let cancelled = false;
    setThumbnail({ thumbnailUrl: null, duration: null });
    loadVideoPoster(item.url)
      .then((poster) => {
        if (!cancelled) {
          setThumbnail({ thumbnailUrl: poster.dataUrl, duration: poster.duration });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [item.url, item.kind]);

  return thumbnail;
}
