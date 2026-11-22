/**
 * Playback engine: the rAF clock, primary-video-driven timeline time, media
 * element seek/play/pause/volume sync, stall watchdog, and the output level
 * for the audio meter.
 */
import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getEffectiveAudioLevel, type AudioCleanupState } from "../../shared/editor-domain";
import { AudioMeter } from "./audio-meter";
import { canDriftSeek } from "./media-utils";
import { resolveNextTimelineTime } from "./playback-clock";
import {
  getSafeMediaSeekTarget,
  getMediaTimeForTimelineTime,
  isMediaTimePlayable,
  type PlaybackSyncReason,
  shouldSeekPrimaryVideo,
  shouldSeekSecondaryMedia
} from "./playback-sync";
import {
  calculateTimelineDuration,
  createClipPlaybackKey,
  createTimelineMediaClips
} from "./timeline-utils";
import { getActiveSpeedRate, getPlaybackRateForTrack } from "./speed-utils";
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

/** How far ahead an upcoming audio clip is parked on its first sample. */
const audioPreRollSeconds = 1.5;

type UseEditorPlaybackParams = {
  activeDuration: number;
  activeVideoClip: TimelineMediaClip | null;
  audioLevels: AudioLevelState;
  audioCleanup: AudioCleanupState;
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
  beginPlaybackInteraction: () => void;
  endPlaybackInteraction: () => void;
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
    audioCleanup,
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
  const hiddenTickRef = useRef<number | null>(null);
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
  const pendingPlayElementsRef = useRef(new WeakSet<HTMLMediaElement>());
  const masterVolumeRef = useRef(100);
  const audioLevelsRef = useRef<AudioLevelState>({});
  const audioCleanupRef = useRef<AudioCleanupState>({});
  const timelineDurationRef = useRef(0);
  const audioMeterRef = useRef<AudioMeter | null>(null);
  const playbackInteractionRef = useRef(false);
  const resumeAfterInteractionRef = useRef(false);

  function getAudioMeter(): AudioMeter {
    audioMeterRef.current ??= new AudioMeter();
    return audioMeterRef.current;
  }

  function applyAudioGain(element: HTMLMediaElement, sourceGain: number, itemId?: string) {
    const cleanup = itemId === undefined ? null : audioCleanupRef.current[itemId] ?? null;
    const connected = getAudioMeter().setElementGain(element, sourceGain, cleanup);
    element.volume = connected
      ? 1
      : Math.min(1, Math.max(0, (masterVolumeRef.current / 100) * sourceGain));
  }

  useEffect(() => {
    return () => {
      audioMeterRef.current?.dispose();
    };
  }, []);

  // After the OS sleeps/locks or the window loses focus, the AudioContext can be
  // left suspended/interrupted; playback then continues visually while audio
  // goes silent until the next explicit play toggle (the only other resume
  // point). Resume it on focus/visibility regain while playing so sound returns
  // on its own.
  useEffect(() => {
    function resumeIfPlaying() {
      if (playingRef.current) {
        void audioMeterRef.current?.resume().catch(() => undefined);
      }
    }

    document.addEventListener("visibilitychange", resumeIfPlaying);
    window.addEventListener("focus", resumeIfPlaying);
    return () => {
      document.removeEventListener("visibilitychange", resumeIfPlaying);
      window.removeEventListener("focus", resumeIfPlaying);
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
    audioCleanupRef.current = audioCleanup;
  }, [audioCleanup]);

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
    // requestAnimationFrame stops while the window is minimized or covered, but
    // the media elements keep playing. Keep ticking on a timer so cuts are
    // still honored and playback still stops at the end.
    const scheduleStep = () => {
      if (document.hidden) {
        hiddenTickRef.current = window.setTimeout(() => step(performance.now()), 50);
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    const step = (now: number) => {
      rafRef.current = null;
      hiddenTickRef.current = null;
      const dt = Math.min(document.hidden ? 1 : 0.1, (now - last) / 1000);
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
      scheduleStep();
    };

    scheduleStep();
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (hiddenTickRef.current) {
        window.clearTimeout(hiddenTickRef.current);
        hiddenTickRef.current = null;
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
      const mainCleanup = activeVideoClip ? audioCleanup[activeVideoClip.item.id] ?? null : null;
      const connected = !mainVideoRef.current.muted && meter.setElementGain(mainVideoRef.current, 1, mainCleanup);
      mainVideoRef.current.volume = connected ? 1 : Math.min(1, master);
    }
    for (const clip of audioTimelineClips) {
      const element = audioElsRef.current.get(clip.id);
      if (!element) {
        continue;
      }
      const level = getEffectiveAudioLevel(audioLevels, clip.item.id, clip.lane);
      applyAudioGain(element, level.muted ? 0 : level.volume / 100, clip.item.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterVolume, audioLevels, audioCleanup, activeVideoClip, audioTimelineClips]);

  function getClipVolume(clip: TimelineMediaClip): number {
    const level = getEffectiveAudioLevel(
      audioLevelsRef.current,
      clip.item.id,
      clip.lane
    );
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

  function getPrimaryPlaybackVideoElement(): HTMLVideoElement | null {
    return mainVideoRef.current ?? cameraRef.current;
  }

  function getNextPlaybackTime(dt: number): number {
    const clockClip = findVideoClipAtTime(currentTimeRef.current);
    const videoEl = getPrimaryPlaybackVideoElement();
    const videoClock =
      clockClip?.item.kind === "video" && videoEl
        ? {
            clip: clockClip,
            mediaTime: videoEl.currentTime,
            ended: videoEl.ended,
            ready:
              !videoEl.seeking &&
              !videoEl.paused &&
              videoEl.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
          }
        : null;

    return resolveNextTimelineTime({
      currentTime: currentTimeRef.current,
      elapsedSeconds: dt,
      playbackRate: getPlaybackRate(currentTimeRef.current),
      videoClock
    });
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
    if (pendingPlayElementsRef.current.has(element)) {
      return;
    }

    const token = playbackAttemptTokenRef.current;
    pendingPlayElementsRef.current.add(element);
    void element.play().then(() => {
      pendingPlayElementsRef.current.delete(element);
      if (token !== playbackAttemptTokenRef.current || !playingRef.current) {
        element.pause();
      }
    }).catch((playError: unknown) => {
      pendingPlayElementsRef.current.delete(element);
      if (token !== playbackAttemptTokenRef.current || !playingRef.current) {
        return;
      }

      const detail = playError instanceof Error ? playError.message : String(playError);
      stopPlayback("pause", `Could not start ${label} playback: ${detail}`);
    });
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
    const canSeek =
      canSetMediaTime(input.element) &&
      !(input.reason === "tick" && input.element.seeking);
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
      Math.abs(input.element.currentTime - desired) <= 0.05
    ) {
      input.syncedKeyRef.current = clipPlaybackKey;
      input.pendingSeekKeyRef.current = null;
    }

    input.element.muted = input.muted;
    if (input.muted) {
      audioMeterRef.current?.setElementGain(input.element, 0, null);
      input.element.volume = 0;
    } else {
      const clipCleanup = audioCleanupRef.current[input.videoClip.item.id] ?? null;
      const connected = getAudioMeter().setElementGain(input.element, 1, clipCleanup);
      input.element.volume = connected ? 1 : input.volume;
    }
    input.element.playbackRate = getPlaybackRateForTrack("video", speedEffectsRef.current, input.timelineTime);
    if (
      input.isPlaying &&
      input.element.paused &&
      !input.element.seeking &&
      !input.element.ended
    ) {
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
    const seekTarget = getSafeMediaSeekTarget(desired, input.element.duration);
    const playable = isMediaTimePlayable(desired, input.element.duration);
    const now = performance.now();
    const lastSeekAt = secondaryDriftSeekTimesRef.current.get(input.syncKey) ?? null;
    const shouldSeek = shouldSeekSecondaryMedia({
      reason: input.reason,
      isPlaying: input.isPlaying,
      clipChanged: input.clipChanged,
      canSeek:
        input.reason === "tick" ? canDriftSeek(input.element) : canSetMediaTime(input.element),
      currentMediaTime: input.element.currentTime,
      desiredMediaTime: seekTarget,
      nowMs: now,
      lastSeekAtMs: lastSeekAt
    });

    if (shouldSeek && trySetMediaTime(input.element, seekTarget)) {
      secondaryDriftSeekTimesRef.current.set(input.syncKey, now);
    }

    if (input.useEngine) {
      applyAudioGain(input.element, input.volume, input.clip.item.id);
    } else {
      input.element.volume = input.volume;
    }
    input.element.playbackRate = getPlaybackRateForTrack(input.clip.track, speedEffectsRef.current, input.timelineTime);
    if (
      input.isPlaying &&
      playable &&
      input.element.paused &&
      !input.element.seeking &&
      !input.element.ended
    ) {
      playMediaElement(input.element, input.label);
    } else if ((!input.isPlaying || !playable) && !input.element.paused) {
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

    // The picture is the timeline clock: while it seeks or buffers (after every
    // cut, and at play start) the clock holds, so hold the audio as well or the
    // voice runs ahead of the video by the decoder's seek latency.
    const clockElement =
      videoClip?.item.kind === "video" ? getPrimaryPlaybackVideoElement() : null;
    const holdAudioForPicture = Boolean(
      isPlaying &&
        clockElement &&
        !clockElement.ended &&
        (clockElement.seeking ||
          clockElement.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
    );

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
          isPlaying: isPlaying && !holdAudioForPicture,
          reason,
          syncKey: clip.id,
          clipChanged: false,
          volume: getClipVolume(clip),
          label: "audio",
          useEngine: true
        });
      } else {
        if (!element.paused) {
          element.pause();
        }
        // Park the next clip on its first sample ahead of time. Cuts through a
        // recording split its audio into pieces, and a piece that only seeks
        // once it becomes active leaves an audible gap at every edit.
        const lead = clip.start - time;
        if (
          isPlaying &&
          lead > 0 &&
          lead <= audioPreRollSeconds &&
          canSetMediaTime(element) &&
          !element.seeking
        ) {
          const target = getSafeMediaSeekTarget(clip.sourceStart, element.duration);
          if (Math.abs(element.currentTime - target) > 0.05) {
            trySetMediaTime(element, target);
          }
        }
      }
    }
  }

  function stopPlayback(reason: PlaybackSyncReason = "pause", message?: string) {
    playbackAttemptTokenRef.current += 1;
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
  }

  /** Pause the playback clock while a pointer gesture owns timeline time. */
  function beginPlaybackInteraction() {
    if (playbackInteractionRef.current) {
      return;
    }

    playbackInteractionRef.current = true;
    resumeAfterInteractionRef.current = playingRef.current;
    if (playingRef.current) {
      stopPlayback("pause");
    }
  }

  /** Resume only when the timeline was playing before the gesture began. */
  function endPlaybackInteraction() {
    if (!playbackInteractionRef.current) {
      return;
    }

    playbackInteractionRef.current = false;
    const shouldResume = resumeAfterInteractionRef.current;
    resumeAfterInteractionRef.current = false;
    if (shouldResume) {
      togglePlayback();
    }
  }

  function seek(value: number) {
    const duration = timelineDurationRef.current || timelineDuration;
    const nextTime = Math.max(0, Math.min(value, duration || value));
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    syncMediaToTime(nextTime, playingRef.current, "seek");
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
  }

  function scheduleTimelinePlaybackSync(segments: TimelineSegment[]) {
    syncTimelinePlaybackRefs(segments);
    window.queueMicrotask(forceSyncCurrentTimelineMedia);
  }

  return {
    audioElsRef,
    beginPlaybackInteraction,
    cameraRef,
    currentTimeRef,
    endPlaybackInteraction,
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
