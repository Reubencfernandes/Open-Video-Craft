/**
 * Playback engine: the rAF clock, primary-video-driven timeline time, media
 * element seek/play/pause/volume sync, stall watchdog, and the output level
 * for the audio meter.
 */
import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { AudioMeter } from "./audio-meter";
import { canDriftSeek } from "./media-utils";
import {
  getClampedTimelineTimeForMediaTime,
  getMediaTimeForTimelineTime,
  type PlaybackSyncReason,
  shouldSeekPrimaryVideo,
  shouldSeekSecondaryMedia,
  videoStartupProgressToleranceSeconds,
  videoStartupWatchdogMs
} from "./playback-sync";
import {
  calculateTimelineDuration,
  createClipPlaybackKey,
  createTimelineMediaClips
} from "./timeline-utils";
import { getActiveSpeedRate } from "./speed-utils";
import { frameRate } from "./types";
import type {
  EditorMediaItem,
  LayoutMode,
  SpeedEffect,
  SubtitleSegment,
  TimelineMediaClip,
  TimelineSegment,
  ZoomEffect
} from "./types";
import { clampNumber } from "./utils";
import { isZoomActiveAtTime } from "./zoom-utils";

type AudioLevelState = Record<string, { volume: number; muted: boolean }>;

type UseEditorPlaybackParams = {
  activeDuration: number;
  activeVideoClip: TimelineMediaClip | null;
  audioLevels: AudioLevelState;
  audioTimelineClips: TimelineMediaClip[];
  currentTime: number;
  layoutMode: LayoutMode;
  masterVolume: number;
  mediaById: Map<string, EditorMediaItem>;
  playing: boolean;
  previewItem: EditorMediaItem | null;
  projectCamera: EditorMediaItem | null;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  timelineDuration: number;
  timelineSegments: TimelineSegment[];
  totalFrames: number;
  zoomEffects: ZoomEffect[];
};

type UseEditorPlaybackResult = {
  audioElsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  cameraRef: MutableRefObject<HTMLVideoElement | null>;
  currentTimeRef: MutableRefObject<number>;
  getAudioLevel: () => number;
  mainVideoRef: MutableRefObject<HTMLVideoElement | null>;
  playingRef: MutableRefObject<boolean>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (value: number) => void;
  seekFrame: (frame: number) => void;
  syncMediaToTime: (
    time: number,
    isPlaying: boolean,
    reason?: PlaybackSyncReason
  ) => void;
  togglePlayback: () => void;
};

export function useEditorPlayback(params: UseEditorPlaybackParams): UseEditorPlaybackResult {
  const {
    activeDuration,
    activeVideoClip,
    audioLevels,
    audioTimelineClips,
    currentTime,
    layoutMode,
    masterVolume,
    mediaById,
    playing,
    previewItem,
    projectCamera,
    setCurrentTime,
    setError,
    setPlaying,
    speedEffects,
    subtitles,
    timelineDuration,
    timelineSegments,
    totalFrames,
    zoomEffects
  } = params;

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const videoClipsRef = useRef<TimelineMediaClip[]>([]);
  const audioClipsRef = useRef<TimelineMediaClip[]>([]);
  const zoomEffectsRef = useRef<ZoomEffect[]>([]);
  const speedEffectsRef = useRef<SpeedEffect[]>([]);
  const syncedVideoClipKeyRef = useRef<string | null>(null);
  const syncedCameraClipKeyRef = useRef<string | null>(null);
  const pendingVideoSeekKeyRef = useRef<string | null>(null);
  const pendingCameraSeekKeyRef = useRef<string | null>(null);
  const secondaryDriftSeekTimesRef = useRef<Map<string, number>>(new Map());
  const playbackAttemptTokenRef = useRef(0);
  const primaryVideoWatchdogRef = useRef<number | null>(null);
  const primaryVideoWatchdogRetriedRef = useRef(false);
  const masterVolumeRef = useRef(100);
  const audioLevelsRef = useRef<AudioLevelState>({});
  const timelineDurationRef = useRef(0);
  const audioMeterRef = useRef<AudioMeter | null>(null);

  function getAudioMeter(): AudioMeter {
    audioMeterRef.current ??= new AudioMeter();
    return audioMeterRef.current;
  }

  function applyAudioGain(element: HTMLMediaElement, sourceGain: number) {
    const connected = getAudioMeter().setElementGain(element, sourceGain);
    element.volume = connected
      ? 1
      : Math.min(1, Math.max(0, (masterVolumeRef.current / 100) * sourceGain));
  }

  useEffect(() => {
    return () => {
      clearPrimaryVideoWatchdog();
      audioMeterRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    syncTimelinePlaybackRefs(timelineSegments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDuration, mediaById, speedEffects, subtitles, timelineSegments, zoomEffects]);

  useEffect(() => {
    zoomEffectsRef.current = zoomEffects;
  }, [zoomEffects]);

  useEffect(() => {
    speedEffectsRef.current = speedEffects;
  }, [speedEffects]);

  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    audioLevelsRef.current = audioLevels;
  }, [audioLevels]);

  useEffect(() => {
    timelineDurationRef.current = timelineDuration;
  }, [timelineDuration]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    syncMediaToTime(currentTimeRef.current, playingRef.current, "clip-change");
    // The media element is swapped by React when the active clip/source changes;
    // sync after commit so the new element starts at the timeline time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeVideoClip?.id,
    activeVideoClip?.start,
    activeVideoClip?.duration,
    activeVideoClip?.sourceStart,
    previewItem?.url,
    projectCamera?.url,
    layoutMode
  ]);

  // Master playback loop: active videos drive timeline time, while image/empty
  // spans fall back to elapsed rAF time.
  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let last = performance.now();
    let lastUiUpdate = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const previous = currentTimeRef.current;
      const next = getNextPlaybackTime(dt);

      if (next >= timelineDurationRef.current) {
        currentTimeRef.current = timelineDurationRef.current;
        setCurrentTime(timelineDurationRef.current);
        stopPlayback("seek");
        return;
      }

      currentTimeRef.current = next;
      syncMediaToTime(next, true, "tick");
      const previousClipKey = findVideoClipAtTime(previous)?.id ?? null;
      const nextClipKey = findVideoClipAtTime(next)?.id ?? null;
      const frameInterval = isZoomActiveAtTime(zoomEffectsRef.current, next) ? 16 : 33;
      if (previousClipKey !== nextClipKey || now - lastUiUpdate >= frameInterval) {
        lastUiUpdate = now;
        setCurrentTime(next);
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Apply the same source and master gains to playback and the live meter.
  useEffect(() => {
    const master = Math.max(0, masterVolume / 100);
    const meter = getAudioMeter();
    meter.setMasterGain(master);
    if (mainVideoRef.current) {
      const connected = !mainVideoRef.current.muted && meter.setElementGain(mainVideoRef.current, 1);
      mainVideoRef.current.volume = connected ? 1 : Math.min(1, master);
    }
    for (const clip of audioTimelineClips) {
      const element = audioElsRef.current.get(clip.id);
      if (!element) {
        continue;
      }
      const level = audioLevels[clip.item.id] ?? { volume: 100, muted: false };
      applyAudioGain(element, level.muted ? 0 : level.volume / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterVolume, audioLevels, audioTimelineClips]);

  function getClipVolume(itemId: string): number {
    const level = audioLevelsRef.current[itemId] ?? { volume: 100, muted: false };
    if (level.muted) {
      return 0;
    }
    return level.volume / 100;
  }

  // Actual mixed output peak. Values above 1 remain visible as clipping.
  function getAudioMeterLevel(): number {
    return audioMeterRef.current?.sample() ?? 0;
  }

  function findVideoClipAtTime(time: number): TimelineMediaClip | null {
    return (
      videoClipsRef.current.find(
        (clip) => time >= clip.start && time < clip.start + clip.duration
      ) ?? null
    );
  }

  function findClipByPlaybackKey(key: string | null): TimelineMediaClip | null {
    if (!key) {
      return null;
    }

    return videoClipsRef.current.find((clip) => createClipPlaybackKey(clip) === key) ?? null;
  }

  function getPrimaryPlaybackVideoElement(): HTMLVideoElement | null {
    return mainVideoRef.current ?? cameraRef.current;
  }

  function getPlaybackClockClip(time: number): TimelineMediaClip | null {
    const syncedKey = mainVideoRef.current
      ? syncedVideoClipKeyRef.current
      : syncedCameraClipKeyRef.current;
    const syncedClip = findClipByPlaybackKey(syncedKey);
    if (
      syncedClip?.item.kind === "video" &&
      time >= syncedClip.start &&
      time <= syncedClip.start + syncedClip.duration
    ) {
      return syncedClip;
    }

    return findVideoClipAtTime(time);
  }

  function getNextPlaybackTime(dt: number): number {
    const clockClip = getPlaybackClockClip(currentTimeRef.current);
    if (clockClip?.item.kind === "video") {
      const videoEl = getPrimaryPlaybackVideoElement();
      if (videoEl && videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
        return getClampedTimelineTimeForMediaTime(clockClip, videoEl.currentTime);
      }

      return currentTimeRef.current;
    }

    return currentTimeRef.current + dt * getPlaybackRate(currentTimeRef.current);
  }

  function getPlaybackRate(time: number): number {
    return getActiveSpeedRate(speedEffectsRef.current, time);
  }

  function canSetMediaTime(element: HTMLMediaElement): boolean {
    return element.readyState >= HTMLMediaElement.HAVE_METADATA;
  }

  function trySetMediaTime(element: HTMLMediaElement, time: number): boolean {
    try {
      element.currentTime = time;
      return true;
    } catch {
      return false;
    }
  }

  function playMediaElement(element: HTMLMediaElement, label: string) {
    const token = playbackAttemptTokenRef.current;
    void element.play().catch((playError: unknown) => {
      if (token !== playbackAttemptTokenRef.current || !playingRef.current) {
        return;
      }

      const detail = playError instanceof Error ? playError.message : String(playError);
      stopPlayback("pause", `Could not start ${label} playback: ${detail}`);
    });
  }

  function clearPrimaryVideoWatchdog() {
    if (primaryVideoWatchdogRef.current !== null) {
      window.clearTimeout(primaryVideoWatchdogRef.current);
      primaryVideoWatchdogRef.current = null;
    }
  }

  function armPrimaryVideoWatchdog(resetRetry = true) {
    clearPrimaryVideoWatchdog();
    if (resetRetry) {
      primaryVideoWatchdogRetriedRef.current = false;
    }

    const videoClip = findVideoClipAtTime(currentTimeRef.current);
    const videoEl = getPrimaryPlaybackVideoElement();
    if (!playingRef.current || videoClip?.item.kind !== "video" || !videoEl) {
      return;
    }

    const clipKey = createClipPlaybackKey(videoClip);
    const startMediaTime = videoEl.currentTime;
    primaryVideoWatchdogRef.current = window.setTimeout(() => {
      primaryVideoWatchdogRef.current = null;
      if (!playingRef.current) {
        return;
      }

      const currentClip = findVideoClipAtTime(currentTimeRef.current);
      const currentVideoEl = getPrimaryPlaybackVideoElement();
      if (
        currentClip?.item.kind !== "video" ||
        !currentVideoEl ||
        createClipPlaybackKey(currentClip) !== clipKey
      ) {
        return;
      }

      const advanced =
        currentVideoEl.currentTime - startMediaTime > videoStartupProgressToleranceSeconds;
      if (advanced || currentVideoEl.ended) {
        return;
      }

      if (!primaryVideoWatchdogRetriedRef.current) {
        primaryVideoWatchdogRetriedRef.current = true;
        const desired = getMediaTimeForTimelineTime(currentClip, currentTimeRef.current);
        if (canSetMediaTime(currentVideoEl)) {
          trySetMediaTime(currentVideoEl, desired);
        }
        playMediaElement(currentVideoEl, "video");
        armPrimaryVideoWatchdog(false);
        return;
      }

      stopPlayback(
        "pause",
        "Playback stalled because the video did not advance. Try seeking a little, then press Play again."
      );
    }, videoStartupWatchdogMs);
  }

  function syncPrimaryVideoElement(input: {
    element: HTMLVideoElement;
    videoClip: TimelineMediaClip;
    timelineTime: number;
    isPlaying: boolean;
    reason: PlaybackSyncReason;
    syncedKeyRef: { current: string | null };
    pendingSeekKeyRef: { current: string | null };
    label: string;
    muted: boolean;
    volume: number;
  }) {
    const desired = getMediaTimeForTimelineTime(input.videoClip, input.timelineTime);
    const clipPlaybackKey = createClipPlaybackKey(input.videoClip);
    const clipChanged = input.syncedKeyRef.current !== clipPlaybackKey;
    const pendingSeek = input.pendingSeekKeyRef.current === clipPlaybackKey;
    const syncReason = pendingSeek ? "clip-change" : input.reason;
    const canSeek = canSetMediaTime(input.element);
    const shouldSeek = shouldSeekPrimaryVideo({
      reason: syncReason,
      isPlaying: input.isPlaying,
      clipChanged,
      canSeek,
      currentMediaTime: input.element.currentTime,
      desiredMediaTime: desired
    });
    const explicitSeek =
      input.reason === "play-start" ||
      input.reason === "seek" ||
      input.reason === "clip-change" ||
      pendingSeek;

    let didSeek = false;
    if (shouldSeek) {
      didSeek = trySetMediaTime(input.element, desired);
    }

    if (didSeek) {
      input.pendingSeekKeyRef.current = null;
      input.syncedKeyRef.current = clipPlaybackKey;
    } else if (explicitSeek && !canSeek) {
      input.pendingSeekKeyRef.current = clipPlaybackKey;
    } else if (
      !clipChanged ||
      Math.abs(input.element.currentTime - desired) <= videoStartupProgressToleranceSeconds
    ) {
      input.syncedKeyRef.current = clipPlaybackKey;
      input.pendingSeekKeyRef.current = null;
    }

    input.element.muted = input.muted;
    if (input.muted) {
      audioMeterRef.current?.setElementGain(input.element, 0);
      input.element.volume = 0;
    } else {
      const connected = getAudioMeter().setElementGain(input.element, 1);
      input.element.volume = connected ? 1 : input.volume;
    }
    input.element.playbackRate = getPlaybackRate(input.timelineTime);
    if (input.isPlaying && input.element.paused) {
      playMediaElement(input.element, input.label);
    } else if (!input.isPlaying && !input.element.paused) {
      input.element.pause();
    }
  }

  function syncSecondaryMediaElement(input: {
    element: HTMLMediaElement;
    clip: TimelineMediaClip;
    timelineTime: number;
    isPlaying: boolean;
    reason: PlaybackSyncReason;
    syncKey: string;
    clipChanged: boolean;
    volume: number;
    label: string;
    useEngine: boolean;
  }) {
    const desired = getMediaTimeForTimelineTime(input.clip, input.timelineTime);
    const now = performance.now();
    const lastSeekAt = secondaryDriftSeekTimesRef.current.get(input.syncKey) ?? null;
    const shouldSeek = shouldSeekSecondaryMedia({
      reason: input.reason,
      isPlaying: input.isPlaying,
      clipChanged: input.clipChanged,
      canSeek:
        input.reason === "tick" ? canDriftSeek(input.element) : canSetMediaTime(input.element),
      currentMediaTime: input.element.currentTime,
      desiredMediaTime: desired,
      nowMs: now,
      lastSeekAtMs: lastSeekAt
    });

    if (shouldSeek && trySetMediaTime(input.element, desired)) {
      secondaryDriftSeekTimesRef.current.set(input.syncKey, now);
    }

    if (input.useEngine) {
      applyAudioGain(input.element, input.volume);
    } else {
      input.element.volume = input.volume;
    }
    input.element.playbackRate = getPlaybackRate(input.timelineTime);
    if (input.isPlaying && input.element.paused) {
      playMediaElement(input.element, input.label);
    } else if (!input.isPlaying && !input.element.paused) {
      input.element.pause();
    }
  }

  // Sync media to the timeline time. During normal playback the primary video
  // is the clock source, so this function avoids hard-seeking it on ticks.
  function syncMediaToTime(
    time: number,
    isPlaying: boolean,
    reason: PlaybackSyncReason = "tick"
  ) {
    const master = Math.min(1, Math.max(0, masterVolumeRef.current / 100));
    getAudioMeter().setMasterGain(masterVolumeRef.current / 100);
    const videoClip = findVideoClipAtTime(time);

    const videoEl = mainVideoRef.current;
    if (videoEl && videoClip && videoClip.item.kind === "video") {
      syncPrimaryVideoElement({
        element: videoEl,
        videoClip,
        timelineTime: time,
        isPlaying,
        reason,
        syncedKeyRef: syncedVideoClipKeyRef,
        pendingSeekKeyRef: pendingVideoSeekKeyRef,
        label: "video",
        muted: videoClip.item.origin === "project",
        volume: master
      });
    } else if (videoEl && !videoEl.paused) {
      videoEl.pause();
      syncedVideoClipKeyRef.current = null;
      pendingVideoSeekKeyRef.current = null;
    } else if (!videoClip) {
      syncedVideoClipKeyRef.current = null;
      pendingVideoSeekKeyRef.current = null;
    }

    const cameraEl = cameraRef.current;
    if (cameraEl && videoClip && videoClip.item.kind === "video") {
      const clipPlaybackKey = createClipPlaybackKey(videoClip);
      const clipChanged = syncedCameraClipKeyRef.current !== clipPlaybackKey;

      if (!videoEl) {
        syncPrimaryVideoElement({
          element: cameraEl,
          videoClip,
          timelineTime: time,
          isPlaying,
          reason,
          syncedKeyRef: syncedCameraClipKeyRef,
          pendingSeekKeyRef: pendingCameraSeekKeyRef,
          label: "camera",
          muted: true,
          volume: 0
        });
      } else {
        syncedCameraClipKeyRef.current = clipPlaybackKey;
        pendingCameraSeekKeyRef.current = null;
        syncSecondaryMediaElement({
          element: cameraEl,
          clip: videoClip,
          timelineTime: time,
          isPlaying,
          reason,
          syncKey: "camera",
          clipChanged,
          volume: 0,
          label: "camera",
          useEngine: false
        });
        cameraEl.muted = true;
      }
    } else {
      syncedCameraClipKeyRef.current = null;
      pendingCameraSeekKeyRef.current = null;
    }

    for (const clip of audioClipsRef.current) {
      const element = audioElsRef.current.get(clip.id);
      if (!element) {
        continue;
      }

      const active = time >= clip.start && time < clip.start + clip.duration;
      if (active) {
        syncSecondaryMediaElement({
          element,
          clip,
          timelineTime: time,
          isPlaying,
          reason,
          syncKey: clip.id,
          clipChanged: false,
          volume: getClipVolume(clip.item.id),
          label: "audio",
          useEngine: true
        });
      } else if (!element.paused) {
        element.pause();
      }
    }
  }

  function stopPlayback(reason: PlaybackSyncReason = "pause", message?: string) {
    playbackAttemptTokenRef.current += 1;
    clearPrimaryVideoWatchdog();
    playingRef.current = false;
    setPlaying(false);
    syncMediaToTime(currentTimeRef.current, false, reason);
    if (message) {
      setError(message);
    }
  }

  function togglePlayback() {
    if (playingRef.current) {
      stopPlayback("pause");
      return;
    }

    let startAt = currentTimeRef.current;
    if (startAt >= timelineDuration - 0.05) {
      startAt = 0;
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    void getAudioMeter().resume().catch(() => undefined);
    playbackAttemptTokenRef.current += 1;
    playingRef.current = true;
    setPlaying(true);
    setError(null);
    syncMediaToTime(startAt, true, "play-start");
    armPrimaryVideoWatchdog();
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, timelineDuration || value));
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current, "seek");
    if (playingRef.current) {
      armPrimaryVideoWatchdog();
    }
  }

  function seekFrame(frame: number) {
    const nextFrame = Math.max(0, Math.min(frame, totalFrames));
    seek(nextFrame / frameRate);
  }

  function syncTimelinePlaybackRefs(segments: TimelineSegment[]): number {
    const nextTimelineClips = createTimelineMediaClips(segments, mediaById);
    const nextVideoClips = nextTimelineClips.filter((clip) => clip.track === "video");
    const nextAudioClips = nextTimelineClips.filter((clip) => clip.track === "audio");
    const nextTimelineDuration = calculateTimelineDuration(
      nextVideoClips,
      nextAudioClips,
      zoomEffects,
      speedEffects,
      subtitles,
      activeDuration
    );

    videoClipsRef.current = nextVideoClips;
    audioClipsRef.current = nextAudioClips;
    timelineDurationRef.current = nextTimelineDuration;
    return nextTimelineDuration;
  }

  function forceSyncCurrentTimelineMedia() {
    const safeDuration = Math.max(timelineDurationRef.current, 1);
    const nextTime = clampNumber(currentTimeRef.current, 0, safeDuration);
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current, "clip-change");
    if (playingRef.current) {
      armPrimaryVideoWatchdog();
    }
  }

  function scheduleTimelinePlaybackSync(segments: TimelineSegment[]) {
    syncTimelinePlaybackRefs(segments);
    window.queueMicrotask(forceSyncCurrentTimelineMedia);
  }

  return {
    audioElsRef,
    cameraRef,
    currentTimeRef,
    getAudioLevel: () => getAudioMeterLevel(),
    mainVideoRef,
    playingRef,
    scheduleTimelinePlaybackSync,
    seek,
    seekFrame,
    syncMediaToTime,
    togglePlayback
  };
}
