/**
 * All pointer interactions on the timeline body: scrubbing the playhead,
 * moving/trimming media clips, dragging zoom/speed effect regions, dragging
 * subtitle clips, and the right-click context menu.
 *
 * The timeline body funnels every pointer event through three handlers
 * (`beginTimelineScrub` / `moveTimelineScrub` / `endTimelineScrub`); the
 * `begin*` handlers below arm one of the drag refs, and the move/end handlers
 * dispatch to whichever drag is active — otherwise the pointer scrubs the
 * playhead. Keeping this state machine in one hook means EditorView only wires
 * the returned handlers into the Timeline component.
 *
 * Undo semantics: move/trim drags mutate segments live for immediate visual
 * feedback and push a single undo entry when the drag finishes.
 */
import { useRef } from "react";
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction
} from "react";
import {
  constrainZoomEnd,
  constrainZoomMove,
  constrainZoomStart
} from "../zoom-timing";
import {
  areTimelineSegmentsEqual,
  findTimelineSegmentAtTime,
  moveTimelineSegment,
  trimTimelineSegment
} from "./timeline-utils";
import { clampNumber } from "./utils";
import type {
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TimelineContextMenu,
  TimelineSegment,
  TimelineTrimDrag,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

type EffectDragMode = "move" | "start" | "end";

type EffectDrag = {
  id: string;
  mode: EffectDragMode;
  pointerStartTime: number;
  origStart: number;
  origEnd: number;
  moved: boolean;
};

type UseTimelineDragInteractionsParams = {
  currentTimeRef: MutableRefObject<number>;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  mediaDurationById: Map<string, number>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  seekTimelinePointer: (clientX: number) => void;
  setActiveTool: Dispatch<SetStateAction<EditorTool>>;
  setScrubbingTimeline: Dispatch<SetStateAction<boolean>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpeedId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineRedoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineUndoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  updateSpeedEffect: (id: string, updates: Partial<SpeedEffect>) => void;
  updateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  updateZoomEffect: (id: string, updates: Partial<ZoomEffect>) => void;
  zoomEffects: ZoomEffect[];
};

export function useTimelineDragInteractions(params: UseTimelineDragInteractionsParams) {
  const {
    currentTimeRef,
    getTimelineTimeFromClientX,
    mediaDurationById,
    scheduleTimelinePlaybackSync,
    seek,
    seekTimelinePointer,
    setActiveTool,
    setScrubbingTimeline,
    setSelectedItemId,
    setSelectedSpeedId,
    setSelectedSubtitleId,
    setSelectedTimelineSegmentId,
    setSelectedZoomId,
    setSubtitles,
    setTimelineContextMenu,
    setTimelineRedoStack,
    setTimelineSegments,
    setTimelineUndoStack,
    speedEffects,
    subtitles,
    timelineBodyRef,
    timelineDuration,
    timelineRenderDuration,
    timelineSegments,
    updateSpeedEffect,
    updateSubtitle,
    updateZoomEffect,
    zoomEffects
  } = params;

  // One ref per drag kind; at most one is non-null at a time. Plain playhead
  // scrubbing uses the boolean ref.
  const timelineDragRef = useRef(false);
  const timelineTrimDragRef = useRef<TimelineTrimDrag | null>(null);
  const timelineMoveDragRef = useRef<{
    segmentId: string;
    pointerStartTime: number;
    segmentStart: number;
    moved: boolean;
    originalSegments: TimelineSegment[];
  } | null>(null);
  const zoomDragRef = useRef<EffectDrag | null>(null);
  const speedDragRef = useRef<EffectDrag | null>(null);
  const subtitleDragRef = useRef<{
    mode: EffectDragMode;
    pointerStartTime: number;
    original: SubtitleSegment;
    moved: boolean;
  } | null>(null);

  function anyClipDragActive(): boolean {
    return Boolean(
      timelineTrimDragRef.current ||
        timelineMoveDragRef.current ||
        zoomDragRef.current ||
        speedDragRef.current ||
        subtitleDragRef.current
    );
  }

  // ---------------------------------------------------------------------------
  // Context menu.
  // ---------------------------------------------------------------------------

  function openTimelineContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const time = getTimelineTimeFromClientX(event.clientX);
    if (time === null) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const targetSegmentId =
      target?.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId ??
      findTimelineSegmentAtTime(timelineSegments, time)?.id ??
      null;

    if (targetSegmentId) {
      setSelectedTimelineSegmentId(targetSegmentId);
      const targetSegment = timelineSegments.find((segment) => segment.id === targetSegmentId);
      if (targetSegment) {
        setSelectedItemId(targetSegment.itemId);
      }
    }

    setTimelineContextMenu({
      x: event.clientX,
      y: event.clientY,
      time,
      segmentId: targetSegmentId
    });
  }

  // ---------------------------------------------------------------------------
  // Media clip trim (edge drag).
  // ---------------------------------------------------------------------------

  function beginTimelineClipTrim(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) {
    event.preventDefault();
    event.stopPropagation();
    timelineTrimDragRef.current = {
      segmentId,
      edge,
      originalSegments: timelineSegments
    };
    setSelectedTimelineSegmentId(segmentId);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipTrim(clientX: number) {
    const drag = timelineTrimDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    setTimelineSegments((current) => {
      const next = trimTimelineSegment(current, drag.segmentId, drag.edge, time, mediaDurationById);
      if (!areTimelineSegmentsEqual(current, next)) {
        scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
  }

  // Trims mutate live during the drag; push a single undo entry at the end.
  function finishTimelineClipTrim() {
    const drag = timelineTrimDragRef.current;
    if (!drag) {
      return;
    }

    setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        setTimelineRedoStack([]);
      }

      return current;
    });
    timelineTrimDragRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Media clip move (body drag).
  // ---------------------------------------------------------------------------

  function beginTimelineClipMove(event: ReactPointerEvent<HTMLElement>, segmentId: string) {
    if (timelineTrimDragRef.current) {
      return;
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const segment = timelineSegments.find((item) => item.id === segmentId);
    if (time === null || !segment) {
      return;
    }

    timelineMoveDragRef.current = {
      segmentId,
      pointerStartTime: time,
      segmentStart: segment.start,
      moved: false,
      originalSegments: timelineSegments
    };
    setSelectedTimelineSegmentId(segmentId);
    // Clips can cover the whole lane, so a click on a clip must still move the
    // playhead; a real drag only starts after the move threshold.
    seek(time);
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipMove(clientX: number) {
    const drag = timelineMoveDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    // Ignore sub-frame jitters so a plain click doesn't count as a move.
    const delta = time - drag.pointerStartTime;
    if (!drag.moved && Math.abs(delta) < 0.02) {
      return;
    }

    drag.moved = true;
    const rawStart = Math.max(0, drag.segmentStart + delta);
    setTimelineSegments((current) => {
      const next = moveTimelineSegment(current, drag.segmentId, rawStart, timelineRenderDuration, [
        currentTimeRef.current
      ]);
      if (!areTimelineSegmentsEqual(current, next)) {
        scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
  }

  function finishTimelineClipMove() {
    const drag = timelineMoveDragRef.current;
    if (!drag) {
      return;
    }

    timelineMoveDragRef.current = null;
    if (!drag.moved) {
      return;
    }

    setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        setTimelineRedoStack([]);
      }

      return current;
    });
  }

  // ---------------------------------------------------------------------------
  // Zoom effect drag (move or resize a region on the zoom track).
  // ---------------------------------------------------------------------------

  function beginZoomClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const effect = zoomEffects.find((item) => item.id === id);
    if (time === null || !effect) {
      return;
    }

    zoomDragRef.current = {
      id,
      mode,
      pointerStartTime: time,
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    setSelectedZoomId(id);
    if (mode === "move") {
      seek(time);
    }
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateZoomClipDrag(clientX: number) {
    const drag = zoomDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    if (drag.mode === "move") {
      const delta = time - drag.pointerStartTime;
      if (!drag.moved && Math.abs(delta) < 0.02) {
        return;
      }
      drag.moved = true;
      const constrained = constrainZoomMove(
        zoomEffects,
        drag.id,
        drag.origStart + delta,
        timelineDuration
      );
      if (constrained) {
        updateZoomEffect(drag.id, constrained);
      }
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(zoomEffects, drag.id, time);
      if (constrained) {
        updateZoomEffect(drag.id, constrained);
      }
      return;
    }

    const constrained = constrainZoomEnd(zoomEffects, drag.id, time, timelineDuration);
    if (constrained) {
      updateZoomEffect(drag.id, constrained);
    }
  }

  function finishZoomClipDrag() {
    zoomDragRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Speed effect drag (same shape as zoom; speed regions share zoom's
  // non-overlap constraints).
  // ---------------------------------------------------------------------------

  function beginSpeedClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const effect = speedEffects.find((item) => item.id === id);
    if (time === null || !effect) {
      return;
    }

    speedDragRef.current = {
      id,
      mode,
      pointerStartTime: time,
      origStart: effect.start,
      origEnd: effect.end,
      moved: false
    };
    setSelectedSpeedId(id);
    if (mode === "move") {
      seek(time);
    }
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateSpeedClipDrag(clientX: number) {
    const drag = speedDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    if (drag.mode === "move") {
      const delta = time - drag.pointerStartTime;
      if (!drag.moved && Math.abs(delta) < 0.02) {
        return;
      }
      drag.moved = true;
      const constrained = constrainZoomMove(
        speedEffects,
        drag.id,
        drag.origStart + delta,
        timelineDuration
      );
      if (constrained) {
        updateSpeedEffect(drag.id, constrained);
      }
      return;
    }

    if (drag.mode === "start") {
      const constrained = constrainZoomStart(speedEffects, drag.id, time);
      if (constrained) {
        updateSpeedEffect(drag.id, constrained);
      }
      return;
    }

    const constrained = constrainZoomEnd(speedEffects, drag.id, time, timelineDuration);
    if (constrained) {
      updateSpeedEffect(drag.id, constrained);
    }
  }

  function finishSpeedClipDrag() {
    speedDragRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Subtitle clip drag (move keeps word-level karaoke timings aligned).
  // ---------------------------------------------------------------------------

  function beginSubtitleClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EffectDragMode
  ) {
    if (mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
    }

    const time = getTimelineTimeFromClientX(event.clientX);
    const subtitle = subtitles.find((item) => item.id === id);
    if (time === null || !subtitle) {
      return;
    }

    subtitleDragRef.current = {
      mode,
      pointerStartTime: time,
      original: subtitle,
      moved: false
    };
    setSelectedSubtitleId(id);
    setActiveTool("subtitles");
    if (mode === "move") {
      seek(time);
    }
    timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateSubtitleClipDrag(clientX: number) {
    const drag = subtitleDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) {
      return;
    }

    const original = drag.original;
    const minDuration = 0.2;

    if (drag.mode === "move") {
      const delta = time - drag.pointerStartTime;
      if (!drag.moved && Math.abs(delta) < 0.02) {
        return;
      }
      drag.moved = true;
      const start = Math.max(0, original.start + delta);
      const shift = start - original.start;
      setSubtitles((current) =>
        current.map((subtitle) =>
          subtitle.id === original.id
            ? {
                ...subtitle,
                start,
                end: original.end + shift,
                // Keep word-level karaoke timings aligned with the moved clip.
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
      const start = clampNumber(time, 0, original.end - minDuration);
      updateSubtitle(original.id, { start });
      return;
    }

    const end = Math.max(original.start + minDuration, time);
    updateSubtitle(original.id, { end });
  }

  function finishSubtitleClipDrag() {
    subtitleDragRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Timeline body pointer handlers: dispatch to whichever drag is active
  // (trim / zoom / speed / subtitle / move) and otherwise scrub the playhead.
  // ---------------------------------------------------------------------------

  function beginTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (anyClipDragActive()) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input, select, textarea")) {
      return;
    }

    setTimelineContextMenu(null);
    timelineDragRef.current = true;
    setScrubbingTimeline(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTimelinePointer(event.clientX);
  }

  function moveTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    // While a clip/effect is being dragged, suppress the clip reflow transition
    // so it follows the pointer exactly (the transition animates drops instead).
    if (anyClipDragActive()) {
      timelineBodyRef.current?.setAttribute("data-interacting", "true");
    }

    if (timelineTrimDragRef.current) {
      updateTimelineClipTrim(event.clientX);
      return;
    }

    if (zoomDragRef.current) {
      updateZoomClipDrag(event.clientX);
      return;
    }

    if (speedDragRef.current) {
      updateSpeedClipDrag(event.clientX);
      return;
    }

    if (subtitleDragRef.current) {
      updateSubtitleClipDrag(event.clientX);
      return;
    }

    if (timelineMoveDragRef.current) {
      updateTimelineClipMove(event.clientX);
      return;
    }

    if (!timelineDragRef.current) {
      return;
    }

    seekTimelinePointer(event.clientX);
  }

  function endTimelineScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishTimelineClipTrim();
    finishTimelineClipMove();
    finishZoomClipDrag();
    finishSpeedClipDrag();
    finishSubtitleClipDrag();
    // Re-enable clip reflow animation so the drop settles smoothly.
    timelineBodyRef.current?.removeAttribute("data-interacting");
    timelineDragRef.current = false;
    setScrubbingTimeline(false);
  }

  return {
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTimelineClipMove,
    beginTimelineClipTrim,
    beginTimelineScrub,
    beginZoomClipDrag,
    endTimelineScrub,
    moveTimelineScrub,
    openTimelineContextMenu
  };
}
