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

  if (input.reason === "play-start" || input.reason === "seek" || input.reason === "clip-change") {
    return true;
  }

  if (input.reason === "pause") {
    return false;
  }

  // Never hard-seek the primary decoder during ordinary playback. Recorded
  // WebM files often have sparse keyframes; repeatedly assigning currentTime
  // while they are playing can keep Chromium in a permanent seek/buffer loop.
  // Explicit user seeks and clip changes are handled above.
  if (input.reason === "tick") {
    return !input.isPlaying && hasMediaDrift(input);
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
