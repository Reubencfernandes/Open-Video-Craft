/**
 * Create/update/remove logic for the timeline's effect layers:
 *
 *   - zoom regions   (added at the playhead into the first free gap)
 *   - speed regions  (same placement rules as zoom; updates re-sync playback
 *                     because the active rate changes how media time maps to
 *                     timeline time)
 *   - subtitles      (manual add + edits; editing text drops word timings so
 *                     stale karaoke highlights never outlive their words)
 *
 * Pure placement/constraint math lives in ../zoom-timing; this hook only owns
 * the state transitions.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  constrainZoomEnd,
  constrainZoomStart,
  placeZoomInFirstGap,
  zoomMinDurationSeconds
} from "../zoom-timing";
import type { PlaybackSyncReason } from "./playback-sync";
import { defaultSpeedRate, speedMinDurationSeconds } from "./speed-utils";
import { subtitleMinimumDuration } from "./subtitle-time";
import { clampNumber, createId } from "./utils";
import type { EditorTool, SpeedEffect, SubtitleSegment, ZoomEffect } from "./types";

type UseEditorEffectsParams = {
  activeDuration: number;
  currentTime: number;
  currentTimeRef: MutableRefObject<number>;
  playingRef: MutableRefObject<boolean>;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedSpeedId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSpeedEffects: Dispatch<SetStateAction<SpeedEffect[]>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  speedEffects: SpeedEffect[];
  syncMediaToTime: (time: number, isPlaying: boolean, reason?: PlaybackSyncReason) => void;
  timelineDuration: number;
  zoomEffects: ZoomEffect[];
};

export function useEditorEffects(params: UseEditorEffectsParams) {
  const {
    activeDuration,
    currentTime,
    currentTimeRef,
    playingRef,
    setActiveTool,
    setError,
    setSelectedSpeedId,
    setSelectedSubtitleId,
    setSelectedZoomId,
    setSpeedEffects,
    setSubtitles,
    setZoomEffects,
    speedEffects,
    syncMediaToTime,
    timelineDuration,
    zoomEffects
  } = params;

  function addZoomEffect() {
    const start = currentTime;
    const desiredDuration = Math.min(
      2.5,
      Math.max(zoomMinDurationSeconds, timelineDuration - start)
    );
    const placement =
      placeZoomInFirstGap(zoomEffects, start, desiredDuration, timelineDuration) ??
      placeZoomInFirstGap(zoomEffects, start, zoomMinDurationSeconds, timelineDuration);

    if (!placement) {
      setError("There is no room for another zoom after the playhead.");
      return;
    }

    const nextEffect: ZoomEffect = {
      id: createId("zoom"),
      start: placement.start,
      end: placement.end,
      speed: "medium",
      easing: "ease-in-out",
      bezier: [0.42, 0, 0.58, 1],
      scale: 1.5,
      targetX: 50,
      targetY: 50
    };
    setError(null);
    setZoomEffects((current) => [...current, nextEffect]);
    setSelectedZoomId(nextEffect.id);
    setActiveTool("zoom");
  }

  function updateZoomEffect(id: string, updates: Partial<ZoomEffect>) {
    setZoomEffects((current) =>
      current.map((effect) => (effect.id === id ? { ...effect, ...updates } : effect))
    );
  }

  function removeZoomEffect(id: string) {
    setZoomEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedZoomId((current) => (current === id ? null : current));
  }

  function addSpeedEffect() {
    const start = currentTime;
    const desiredDuration = Math.min(
      2.5,
      Math.max(speedMinDurationSeconds, timelineDuration - start)
    );
    const placement =
      placeZoomInFirstGap(speedEffects, start, desiredDuration, timelineDuration) ??
      placeZoomInFirstGap(speedEffects, start, speedMinDurationSeconds, timelineDuration);

    if (!placement) {
      setError("There is no room for another speed section after the playhead.");
      return;
    }

    const nextEffect: SpeedEffect = {
      id: createId("speed"),
      start: placement.start,
      end: placement.end,
      rate: defaultSpeedRate
    };
    setError(null);
    setSpeedEffects((current) => [...current, nextEffect]);
    setSelectedSpeedId(nextEffect.id);
    setActiveTool("speed");
  }

  function updateSpeedEffect(id: string, updates: Partial<SpeedEffect>) {
    setSpeedEffects((current) => {
      const constrainedStart =
        typeof updates.start === "number"
          ? constrainZoomStart(current, id, updates.start)
          : null;
      const constrainedEnd =
        typeof updates.end === "number"
          ? constrainZoomEnd(current, id, updates.end, timelineDuration)
          : null;
      const nextUpdates = {
        ...updates,
        ...(constrainedStart ?? {}),
        ...(constrainedEnd ?? {})
      };

      return current.map((effect) =>
        effect.id === id ? { ...effect, ...nextUpdates } : effect
      );
    });
    syncMediaToTime(currentTimeRef.current, playingRef.current, "clip-change");
  }

  function removeSpeedEffect(id: string) {
    setSpeedEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedSpeedId((current) => (current === id ? null : current));
    syncMediaToTime(currentTimeRef.current, playingRef.current, "clip-change");
  }

  function addSubtitle() {
    const maximum = Math.max(subtitleMinimumDuration, timelineDuration || activeDuration);
    const start = clampNumber(
      currentTime,
      0,
      Math.max(0, maximum - subtitleMinimumDuration)
    );
    const end = Math.min(maximum, start + 3);
    const nextSubtitle: SubtitleSegment = {
      id: createId("subtitle"),
      start,
      end: Math.max(start + subtitleMinimumDuration, end),
      text: "New subtitle"
    };
    setSubtitles((current) => [...current, nextSubtitle]);
    setSelectedSubtitleId(nextSubtitle.id);
    setActiveTool("subtitles");
  }

  function updateSubtitle(id: string, updates: Partial<SubtitleSegment>) {
    // Editing the text invalidates word-level timings, so they are dropped and
    // the overlay falls back to spreading words evenly across the window.
    const timingChanged = "start" in updates || "end" in updates;
    const nextUpdates = "text" in updates || timingChanged
      ? { ...updates, words: undefined }
      : updates;
    const maximum = Math.max(subtitleMinimumDuration, timelineDuration || activeDuration);
    setSubtitles((current) =>
      current.map((subtitle) => {
        if (subtitle.id !== id) {
          return subtitle;
        }

        let start = clampNumber(
          subtitle.start,
          0,
          Math.max(0, maximum - subtitleMinimumDuration)
        );
        if (Number.isFinite(nextUpdates.start)) {
          const requestedStart = nextUpdates.start ?? start;
          const comparisonEnd = Number.isFinite(nextUpdates.end)
            ? nextUpdates.end ?? subtitle.end
            : subtitle.end;
          start = clampNumber(
            requestedStart,
            0,
            Math.max(
              0,
              Math.min(maximum, comparisonEnd) - subtitleMinimumDuration
            )
          );
        }
        const requestedEnd = Number.isFinite(nextUpdates.end)
          ? nextUpdates.end ?? subtitle.end
          : subtitle.end;
        const end = clampNumber(
          requestedEnd,
          start + subtitleMinimumDuration,
          maximum
        );
        return { ...subtitle, ...nextUpdates, start, end };
      })
    );
  }

  return {
    addSpeedEffect,
    addSubtitle,
    addZoomEffect,
    removeSpeedEffect,
    removeZoomEffect,
    updateSpeedEffect,
    updateSubtitle,
    updateZoomEffect
  };
}
