/**
 * Drag state for the timeline's effect-style regions. Zoom, speed, subtitle,
 * and text clips all share the same move/start/end interaction shape, so they
 * live here instead of making the main media timeline drag hook responsible
 * for every editable track.
 *
 * Like media clips, a press only selects: the playhead stays put, and nothing
 * moves until the pointer travels past the drag threshold.
 */
import { useRef } from "react";
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction
} from "react";
import {
  constrainZoomEnd,
  constrainZoomMove,
  constrainZoomStart
} from "../zoom-timing";
import { timelineDragThresholdPx } from "./timeline-selection";
import { clampNumber } from "./utils";
import type {
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  ZoomEffect
} from "./types";

type EffectDragMode = "move" | "start" | "end";

type EffectDrag = {
  id: string;
  mode: EffectDragMode;
  pointerStartClientX: number;
  pointerStartTime: number;
  /** Grabbed edge minus pointer time, so a trim edge never jumps. */
  grabOffset: number;
  origStart: number;
  origEnd: number;
  moved: boolean;
};

type TimedItemDrag<T> = {
  mode: EffectDragMode;
  pointerStartClientX: number;
  pointerStartTime: number;
  grabOffset: number;
  original: T;
  moved: boolean;
};

type UseTimelineEffectDragInteractionsParams = {
  beginPlaybackInteraction: () => void;
  clearMediaSelection: () => void;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setSelectedSpeedId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTextOverlayId: Dispatch<SetStateAction<string | null>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  textOverlays: TextOverlay[];
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  updateSpeedEffect: (id: string, updates: Partial<SpeedEffect>) => void;
  updateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  updateZoomEffect: (id: string, updates: Partial<ZoomEffect>) => void;
  zoomEffects: ZoomEffect[];
};

export function useTimelineEffectDragInteractions(
  params: UseTimelineEffectDragInteractionsParams
) {
  const zoomDragRef = useRef<EffectDrag | null>(null);
  const speedDragRef = useRef<EffectDrag | null>(null);
  const subtitleDragRef = useRef<TimedItemDrag<SubtitleSegment> | null>(null);
  const textOverlayDragRef = useRef<TimedItemDrag<TextOverlay> | null>(null);

  function getGrabOffset(mode: EffectDragMode, start: number, end: number, time: number) {
    return mode === "start" ? start - time : mode === "end" ? end - time : 0;
  }

  /** False until the pointer passes the drag threshold; pauses playback once it does. */
  function passDragThreshold(
    drag: { moved: boolean; pointerStartClientX: number },
    clientX: number
  ) {
    if (drag.moved) return true;
    if (Math.abs(clientX - drag.pointerStartClientX) < timelineDragThresholdPx) return false;
    drag.moved = true;
    params.beginPlaybackInteraction();
    return true;
  }

  function selectExclusiveTimedItem(
    kind: "zoom" | "speed" | "subtitles" | "text",
    id: string
  ) {
    params.clearMediaSelection();
    params.setSelectedZoomId(kind === "zoom" ? id : null);
    params.setSelectedSpeedId(kind === "speed" ? id : null);
    params.setSelectedSubtitleId(kind === "subtitles" ? id : null);
    params.setSelectedTextOverlayId(kind === "text" ? id : null);
    params.setActiveTool(kind);
  }

  function beginZoomClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const effect = params.zoomEffects.find((item) => item.id === id);
    if (time === null || !effect) return;

    zoomDragRef.current = {
      id,
      mode,
      pointerStartClientX: event.clientX,
      pointerStartTime: time,
      grabOffset: getGrabOffset(mode, effect.start, effect.end, time),
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    selectExclusiveTimedItem("zoom", id);
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateZoomClipDrag(clientX: number) {
    const drag = zoomDragRef.current;
    const pointerTime = params.getTimelineTimeFromClientX(clientX);
    if (!drag || pointerTime === null || !passDragThreshold(drag, clientX)) return;
    const time = pointerTime + drag.grabOffset;

    if (drag.mode === "move") {
      const delta = pointerTime - drag.pointerStartTime;
      const constrained = constrainZoomMove(
        params.zoomEffects,
        drag.id,
        drag.origStart + delta,
        params.timelineDuration
      );
      if (constrained) params.updateZoomEffect(drag.id, constrained);
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(params.zoomEffects, drag.id, time);
      if (constrained) params.updateZoomEffect(drag.id, constrained);
      return;
    }

    const constrained = constrainZoomEnd(
      params.zoomEffects,
      drag.id,
      time,
      params.timelineDuration
    );
    if (constrained) params.updateZoomEffect(drag.id, constrained);
  }

  function beginSpeedClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const effect = params.speedEffects.find((item) => item.id === id);
    if (time === null || !effect) return;

    speedDragRef.current = {
      id,
      mode,
      pointerStartClientX: event.clientX,
      pointerStartTime: time,
      grabOffset: getGrabOffset(mode, effect.start, effect.end, time),
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    selectExclusiveTimedItem("speed", id);
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateSpeedClipDrag(clientX: number) {
    const drag = speedDragRef.current;
    const pointerTime = params.getTimelineTimeFromClientX(clientX);
    if (!drag || pointerTime === null || !passDragThreshold(drag, clientX)) return;
    const time = pointerTime + drag.grabOffset;

    if (drag.mode === "move") {
      const delta = pointerTime - drag.pointerStartTime;
      const constrained = constrainZoomMove(
        params.speedEffects,
        drag.id,
        drag.origStart + delta,
        params.timelineDuration
      );
      if (constrained) params.updateSpeedEffect(drag.id, constrained);
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(params.speedEffects, drag.id, time);
      if (constrained) params.updateSpeedEffect(drag.id, constrained);
      return;
    }

    const constrained = constrainZoomEnd(
      params.speedEffects,
      drag.id,
      time,
      params.timelineDuration
    );
    if (constrained) params.updateSpeedEffect(drag.id, constrained);
  }

  function beginSubtitleClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const subtitle = params.subtitles.find((item) => item.id === id);
    if (time === null || !subtitle) return;

    subtitleDragRef.current = {
      mode,
      pointerStartClientX: event.clientX,
      pointerStartTime: time,
      grabOffset: getGrabOffset(mode, subtitle.start, subtitle.end, time),
      original: subtitle,
      moved: false
    };
    selectExclusiveTimedItem("subtitles", id);
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateSubtitleClipDrag(clientX: number) {
    const drag = subtitleDragRef.current;
    const pointerTime = params.getTimelineTimeFromClientX(clientX);
    if (!drag || pointerTime === null || !passDragThreshold(drag, clientX)) return;
    const time = pointerTime + drag.grabOffset;

    const original = drag.original;
    if (drag.mode === "move") {
      const delta = pointerTime - drag.pointerStartTime;
      const start = Math.max(0, original.start + delta);
      const shift = start - original.start;
      params.setSubtitles((current) =>
        current.map((subtitle) =>
          subtitle.id === original.id
            ? {
                ...subtitle,
                start,
                end: original.end + shift,
                words: original.words?.map((word) => ({
                  ...word,
                  start: word.start + shift,
                  end: word.end + shift
                }))
              }
            : subtitle
        )
      );
      return;
    }

    if (drag.mode === "start") {
      params.updateSubtitle(original.id, {
        start: clampNumber(time, 0, original.end - 0.2)
      });
      return;
    }

    params.updateSubtitle(original.id, { end: Math.max(original.start + 0.2, time) });
  }

  function beginTextOverlayClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const overlay = params.textOverlays.find((item) => item.id === id);
    if (time === null || !overlay) return;

    textOverlayDragRef.current = {
      mode,
      pointerStartClientX: event.clientX,
      pointerStartTime: time,
      grabOffset: getGrabOffset(mode, overlay.start, overlay.end, time),
      original: overlay,
      moved: false
    };
    selectExclusiveTimedItem("text", id);
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTextOverlayClipDrag(clientX: number) {
    const drag = textOverlayDragRef.current;
    const pointerTime = params.getTimelineTimeFromClientX(clientX);
    if (!drag || pointerTime === null || !passDragThreshold(drag, clientX)) return;
    const time = pointerTime + drag.grabOffset;

    const original = drag.original;
    if (drag.mode === "move") {
      const delta = pointerTime - drag.pointerStartTime;
      const start = Math.max(0, original.start + delta);
      params.updateTextOverlay(original.id, {
        start,
        end: original.end + (start - original.start)
      });
      return;
    }

    if (drag.mode === "start") {
      params.updateTextOverlay(original.id, {
        start: clampNumber(time, 0, original.end - 0.2)
      });
      return;
    }

    params.updateTextOverlay(original.id, { end: Math.max(original.start + 0.2, time) });
  }

  function isEffectClipDragActive() {
    return Boolean(
      zoomDragRef.current ||
        speedDragRef.current ||
        subtitleDragRef.current ||
        textOverlayDragRef.current
    );
  }

  function updateEffectClipDrag(clientX: number) {
    if (zoomDragRef.current) {
      updateZoomClipDrag(clientX);
      return true;
    }
    if (speedDragRef.current) {
      updateSpeedClipDrag(clientX);
      return true;
    }
    if (subtitleDragRef.current) {
      updateSubtitleClipDrag(clientX);
      return true;
    }
    if (textOverlayDragRef.current) {
      updateTextOverlayClipDrag(clientX);
      return true;
    }
    return false;
  }

  function finishEffectClipDrags() {
    zoomDragRef.current = null;
    speedDragRef.current = null;
    subtitleDragRef.current = null;
    textOverlayDragRef.current = null;
  }

  return {
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTextOverlayClipDrag,
    beginZoomClipDrag,
    finishEffectClipDrags,
    isEffectClipDragActive,
    updateEffectClipDrag
  };
}
