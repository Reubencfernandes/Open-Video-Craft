/**
 * Pure decision helpers for playback sync: when the primary video or a
 * secondary media element should hard-seek, and timeline<->media time maps.
 */
export type PlaybackSyncReason = "tick" | "seek" | "play-start" | "clip-change" | "media-ready" | "pause";

export type ClipPlaybackTiming = {
  start: number;
  duration: number;
  sourceStart: number;
};

export const primaryVideoDriftToleranceSeconds = 0.3;
/** Within this, the next clip already continues from the decoder's frame. */
export const cutContinuityToleranceSeconds = 0.05;
export const secondaryDriftSeekCooldownMs = 350;

export function getSafeMediaSeekTarget(
  desiredMediaTime: number,
  mediaDuration: number,
  endMargin = 0.001
): number {
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return Math.max(0, desiredMediaTime);
  }
  return Math.min(
    Math.max(0, mediaDuration - endMargin),
    Math.max(0, desiredMediaTime)
  );
}

export function isMediaTimePlayable(
  desiredMediaTime: number,
  mediaDuration: number,
  endMargin = 0.001
): boolean {
  return (
    desiredMediaTime >= 0 &&
    (!Number.isFinite(mediaDuration) ||
      mediaDuration <= 0 ||
      desiredMediaTime < mediaDuration - endMargin)
  );
}
export function getMediaTimeForTimelineTime(
  clip: ClipPlaybackTiming,
  timelineTime: number
): number {
  return clip.sourceStart + (timelineTime - clip.start);
}

export function getTimelineTimeForMediaTime(
  clip: ClipPlaybackTiming,
  mediaTime: number
): number {
  return clip.start + (mediaTime - clip.sourceStart);
}

export function getClampedTimelineTimeForMediaTime(
  clip: ClipPlaybackTiming,
  mediaTime: number
): number {
  const timelineTime = getTimelineTimeForMediaTime(clip, mediaTime);
  return Math.min(clip.start + clip.duration, Math.max(clip.start, timelineTime));
}

export function shouldSeekPrimaryVideo(input: {
  reason: PlaybackSyncReason;
  isPlaying: boolean;
  clipChanged: boolean;
  canSeek: boolean;
  currentMediaTime: number;
  desiredMediaTime: number;
  driftTolerance?: number;
}): boolean {
  if (!input.canSeek || !Number.isFinite(input.desiredMediaTime)) {
    return false;
  }

  if (input.reason === "media-ready") {
    return !input.isPlaying && hasMediaDrift(input);
  }

  if (input.reason === "play-start" || input.reason === "seek") {
    return true;
  }

  if (input.reason === "clip-change") {
    // A tick may already have landed the playing decoder on this clip's first
    // frame; seeking it again would only stall playback at the cut.
    return (
      input.clipChanged ||
      !input.isPlaying ||
      hasMediaDrift({ ...input, driftTolerance: cutContinuityToleranceSeconds })
    );
  }

  if (input.reason === "pause") {
    return false;
  }

  // Never drift-correct the primary decoder during ordinary playback. Recorded
  // WebM files often have sparse keyframes; repeatedly assigning currentTime
  // while they are playing can keep Chromium in a permanent seek/buffer loop.
  // Crossing a cut is the exception: it is one seek per clip, and waiting for
  // React to report the new clip first shows frames the edit removed. A cut
  // whose next clip continues from the same frame needs no seek at all.
  if (input.reason === "tick") {
    return input.isPlaying
      ? input.clipChanged &&
          hasMediaDrift({ ...input, driftTolerance: cutContinuityToleranceSeconds })
      : hasMediaDrift(input);
  }

  return !input.isPlaying && (input.clipChanged || hasMediaDrift(input));
}

export function shouldSeekSecondaryMedia(input: {
  reason: PlaybackSyncReason;
  isPlaying: boolean;
  clipChanged: boolean;
  canSeek: boolean;
  currentMediaTime: number;
  desiredMediaTime: number;
  nowMs: number;
  lastSeekAtMs: number | null;
  driftTolerance?: number;
  cooldownMs?: number;
}): boolean {
  if (!input.canSeek || !Number.isFinite(input.desiredMediaTime)) {
    return false;
  }

  if (input.reason === "play-start" || input.reason === "seek" || input.reason === "clip-change") {
    return true;
  }

  if (input.clipChanged && input.reason !== "media-ready") {
    return true;
  }

  if (!hasMediaDrift(input)) {
    return false;
  }

  if (!input.isPlaying) {
    return true;
  }

  return input.lastSeekAtMs === null || input.nowMs - input.lastSeekAtMs >= (input.cooldownMs ?? secondaryDriftSeekCooldownMs);
}

function hasMediaDrift(input: {
  currentMediaTime: number;
  desiredMediaTime: number;
  driftTolerance?: number;
}): boolean {
  return (
    Number.isFinite(input.currentMediaTime) &&
    Math.abs(input.currentMediaTime - input.desiredMediaTime) >
      (input.driftTolerance ?? primaryVideoDriftToleranceSeconds)
  );
}

/** The parts of a media element a scrub seek needs. */
export type ScrubSeekTarget = {
  readonly seeking: boolean;
  currentTime: number;
  addEventListener(type: "seeked", listener: () => void): void;
};

/**
 * Coalesces seeks while the playhead is scrubbed. Every pointer move asks for
 * a new time, and assigning currentTime while the decoder is still seeking
 * aborts that seek, so on recordings with sparse keyframes almost no frame
 * finished decoding and the preview froze until the pointer stopped. While a
 * seek is in flight only the newest target is kept; it is applied as soon as
 * the current frame lands.
 */
export function createScrubSeekQueue(assign: (element: ScrubSeekTarget, time: number) => boolean) {
  const queued = new WeakMap<ScrubSeekTarget, number>();
  const listening = new WeakSet<ScrubSeekTarget>();

  function flush(element: ScrubSeekTarget) {
    const time = queued.get(element);
    if (time === undefined) return;
    queued.delete(element);
    if (Math.abs(element.currentTime - time) > 0.001) {
      assign(element, time);
    }
  }

  return {
    /** Seek now, or after the in-flight seek if one is still decoding. */
    seek(element: ScrubSeekTarget, time: number): boolean {
      if (!element.seeking) {
        queued.delete(element);
        return assign(element, time);
      }
      queued.set(element, time);
      if (!listening.has(element)) {
        listening.add(element);
        element.addEventListener("seeked", () => flush(element));
      }
      return true;
    },
    /** Drop a waiting target because an explicit seek replaces it. */
    cancel(element: ScrubSeekTarget) {
      queued.delete(element);
    }
  };
}
