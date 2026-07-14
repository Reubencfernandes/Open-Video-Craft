/**
 * Resolves the next timeline time from the decoder clock when a video is
 * active. Images and intentional gaps still use the animation-frame clock.
 */
import {
  getClampedTimelineTimeForMediaTime,
  type ClipPlaybackTiming
} from "./playback-sync";

export function resolveNextTimelineTime(input: {
  currentTime: number;
  elapsedSeconds: number;
  playbackRate: number;
  videoClock: {
    clip: ClipPlaybackTiming;
    mediaTime: number;
    ready: boolean;
    ended: boolean;
  } | null;
}): number {
  if (!input.videoClock) {
    return input.currentTime + input.elapsedSeconds * input.playbackRate;
  }

  // Recording tracks commonly differ by a few milliseconds. When the primary
  // decoder reaches its real end, advance to the clip boundary so the editor
  // can stop instead of remaining forever in a false "playing" state.
  if (input.videoClock.ended) {
    return input.videoClock.clip.start + input.videoClock.clip.duration;
  }

  // Do not let the UI clock run ahead while Chromium is seeking or buffering.
  if (!input.videoClock.ready || !Number.isFinite(input.videoClock.mediaTime)) {
    return input.currentTime;
  }

  const mediaTimelineTime = getClampedTimelineTimeForMediaTime(
    input.videoClock.clip,
    input.videoClock.mediaTime
  );

  // A stale decoder frame may briefly report an earlier time after a seek.
  // Holding one frame is preferable to moving the playhead backwards.
  return Math.max(input.currentTime, mediaTimelineTime);
}
