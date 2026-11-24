/**
 * Shared, deduplicated video-thumbnail cache. The Setup/media grid and the
 * timeline both want a poster frame for the same recording URL; capturing it
 * once here keeps them in sync and avoids decoding the same file repeatedly
 * (a recording split into several timeline clips reuses one capture).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ImportedMediaKind } from "../../shared/types";
import type { FilmstripFrame } from "./filmstrip";
import {
  captureTimedVideoFrames,
  captureVideoPoster,
  type VideoPoster
} from "./media-utils";

const posterCache = new Map<string, Promise<VideoPoster>>();

export function loadVideoPoster(url: string): Promise<VideoPoster> {
  const cached = posterCache.get(url);
  if (cached) return cached;
  const pending = captureVideoPoster(url);
  posterCache.set(url, pending);
  void pending.catch(() => posterCache.delete(url));
  return pending;
}

export interface MediaFilmstrip {
  /** Captured frames, sorted by source time. Grows while capture runs. */
  frames: FilmstripFrame[];
  duration: number | null;
}

type FilmstripEntry = {
  snapshot: MediaFilmstrip;
  listeners: Set<() => void>;
};

const emptyFilmstrip: MediaFilmstrip = { frames: [], duration: null };
const filmstripCache = new Map<string, FilmstripEntry>();

/**
 * One capture per video URL, shared by every clip cut from it. Subscribers
 * are told as each frame lands, so the strip fills in progressively.
 */
function getFilmstripEntry(url: string): FilmstripEntry {
  const cached = filmstripCache.get(url);
  if (cached) return cached;

  const entry: FilmstripEntry = { snapshot: emptyFilmstrip, listeners: new Set() };
  filmstripCache.set(url, entry);
  const publish = (snapshot: MediaFilmstrip) => {
    entry.snapshot = snapshot;
    entry.listeners.forEach((listener) => listener());
  };
  captureTimedVideoFrames(url, (frame, duration) => {
    const frames = [...entry.snapshot.frames, frame].sort((a, b) => a.time - b.time);
    publish({ frames, duration });
  }).catch(() => {
    // Let a later mount retry when nothing at all could be captured.
    if (entry.snapshot.frames.length === 0) filmstripCache.delete(url);
  });
  return entry;
}

function subscribeToFilmstrip(url: string, listener: () => void): () => void {
  const entry = getFilmstripEntry(url);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

/** Time-stamped frames for timeline video clips; images use themselves. */
export function useMediaFilmstrip(item: { url: string; kind: ImportedMediaKind }): MediaFilmstrip {
  const isVideo = item.kind === "video";
  const subscribe = useMemo(
    () => (listener: () => void) =>
      isVideo ? subscribeToFilmstrip(item.url, listener) : () => undefined,
    [isVideo, item.url]
  );
  const videoFilmstrip = useSyncExternalStore(
    subscribe,
    () => (isVideo ? getFilmstripEntry(item.url).snapshot : emptyFilmstrip)
  );
  const imageFilmstrip = useMemo<MediaFilmstrip>(
    () => ({ frames: [{ time: 0, src: item.url }], duration: null }),
    [item.url]
  );

  if (item.kind === "image") return imageFilmstrip;
  return isVideo ? videoFilmstrip : emptyFilmstrip;
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
