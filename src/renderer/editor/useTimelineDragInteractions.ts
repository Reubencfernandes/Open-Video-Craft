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
  findTimelineSegmentAtTime,
  getTimelineLaneIdsBetween,
  getTimelineSegmentIdsInRange
} from "./timeline-utils";
import { useTimelineEffectDragInteractions } from "./useTimelineEffectDragInteractions";
import { useTimelineMediaDragInteractions } from "./useTimelineMediaDragInteractions";
import type {
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineContextMenu,
  TimelineLaneId,
  TimelineRangeSelection,
  TimelineSegment,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

type UseTimelineDragInteractionsParams = {
  beginPlaybackInteraction: () => void;
  currentTimeRef: MutableRefObject<number>;
  endPlaybackInteraction: () => void;
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
  setSelectedTextOverlayId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentIds: Dispatch<SetStateAction<string[]>>;
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineRangeSelection: Dispatch<SetStateAction<TimelineRangeSelection | null>>;
  setTimelineRedoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineUndoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  speedEffects: SpeedEffect[];
  selectedTimelineSegmentIds: string[];
  subtitles: SubtitleSegment[];
  textOverlays: TextOverlay[];
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  timelineRangeSelection: TimelineRangeSelection | null;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  updateSpeedEffect: (id: string, updates: Partial<SpeedEffect>) => void;
  updateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  updateZoomEffect: (id: string, updates: Partial<ZoomEffect>) => void;
  zoomEffects: ZoomEffect[];
};

export function useTimelineDragInteractions(params: UseTimelineDragInteractionsParams) {
  const {
    beginPlaybackInteraction,
    currentTimeRef,
    endPlaybackInteraction,
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
    setSelectedTextOverlayId,
    setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds,
    setSelectedZoomId,
    setSubtitles,
    setTimelineContextMenu,
    setTimelineRangeSelection,
    setTimelineRedoStack,
    setTimelineSegments,
    setTimelineUndoStack,
    speedEffects,
    selectedTimelineSegmentIds,
    subtitles,
    textOverlays,
    timelineBodyRef,
    timelineDuration,
    timelineRangeSelection,
    timelineRenderDuration,
    timelineSegments,
    updateSpeedEffect,
    updateSubtitle,
    updateTextOverlay,
    updateZoomEffect,
    zoomEffects
  } = params;

  // One ref per drag kind; at most one is non-null at a time. Plain playhead
  // scrubbing uses the boolean ref.
  const timelineDragRef = useRef(false);
  const rangeSelectionDragRef = useRef<{
    anchorClientX: number;
    anchorClientY: number;
    anchorLaneId: TimelineLaneId;
    anchorTime: number;
    moved: boolean;
  } | null>(null);
  const {
    beginTimelineClipMove,
    beginTimelineClipTrim,
    finishMediaClipDrags,
    isMediaClipDragActive,
    updateMediaClipDrag
  } = useTimelineMediaDragInteractions({
    beginPlaybackInteraction,
    currentTimeRef,
    getTimelineTimeFromClientX,
    mediaDurationById,
    scheduleTimelinePlaybackSync,
    seek,
    selectedTimelineSegmentIds,
    setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds,
    setTimelineRangeSelection,
    setTimelineRedoStack,
    setTimelineSegments,
    setTimelineUndoStack,
    timelineBodyRef,
    timelineRangeSelection,
    timelineRenderDuration,
    timelineSegments
  });
  const {
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTextOverlayClipDrag,
    beginZoomClipDrag,
    finishEffectClipDrags,
    isEffectClipDragActive,
    updateEffectClipDrag
  } = useTimelineEffectDragInteractions({
    beginPlaybackInteraction,
    getTimelineTimeFromClientX,
    seek,
    setActiveTool,
    setSelectedSpeedId,
    setSelectedSubtitleId,
    setSelectedTextOverlayId,
    setSelectedZoomId,
    setSubtitles,
    speedEffects,
    subtitles,
    textOverlays,
    timelineBodyRef,
    timelineDuration,
    updateSpeedEffect,
    updateSubtitle,
    updateTextOverlay,
    updateZoomEffect,
    zoomEffects
  });

  function anyClipDragActive(): boolean {
    return Boolean(
      isMediaClipDragActive() || isEffectClipDragActive()
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
      setSelectedTimelineSegmentIds([targetSegmentId]);
      setTimelineRangeSelection(null);
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
  // Timeline body pointer handlers: dispatch to whichever drag is active
  // (trim / zoom / speed / subtitle / move) and otherwise scrub the playhead.
  // ---------------------------------------------------------------------------

  function getTimelineLaneEntries() {
    const body = timelineBodyRef.current;
    if (!body) return [];

    return [...body.querySelectorAll<HTMLElement>("[data-timeline-lane]")]
      .map((element) => {
        const laneId = parseTimelineLaneId(element.dataset.timelineLane);
        return laneId ? { element, laneId } : null;
      })
      .filter(
        (entry): entry is { element: HTMLElement; laneId: TimelineLaneId } => Boolean(entry)
      );
  }

  function getTimelineLaneIdAtClientY(clientY: number): TimelineLaneId | null {
    const entries = getTimelineLaneEntries();
    let nearest: { laneId: TimelineLaneId; distance: number } | null = null;

    for (const entry of entries) {
      const bounds = entry.element.getBoundingClientRect();
      const distance =
        clientY < bounds.top
          ? bounds.top - clientY
          : clientY > bounds.bottom
            ? clientY - bounds.bottom
            : 0;
      if (!nearest || distance < nearest.distance) {
        nearest = { laneId: entry.laneId, distance };
      }
      if (distance === 0) break;
    }

    return nearest?.laneId ?? null;
  }

  function updateTimelineRangeSelection(clientX: number, clientY: number) {
    const drag = rangeSelectionDragRef.current;
    const time = getTimelineTimeFromClientX(clientX);
    const currentLaneId = getTimelineLaneIdAtClientY(clientY);
    if (!drag || time === null || !currentLaneId) {
      return;
    }

    if (
      !drag.moved &&
      Math.hypot(clientX - drag.anchorClientX, clientY - drag.anchorClientY) < 4
    ) {
      return;
    }
    drag.moved = true;
    const laneIds = getTimelineLaneIdsBetween(
      getTimelineLaneEntries().map((entry) => entry.laneId),
      drag.anchorLaneId,
      currentLaneId
    );
    if (laneIds.length === 0) return;
    const selection = {
      start: Math.min(drag.anchorTime, time),
      end: Math.max(drag.anchorTime, time),
      laneIds
    };
    const ids = getTimelineSegmentIdsInRange(
      timelineSegments,
      selection.start,
      selection.end,
      selection.laneIds
    );
    const primary =
      ids
        .map((id) => timelineSegments.find((segment) => segment.id === id))
        .find((segment) => segment?.track === "video") ??
      (ids[0] ? timelineSegments.find((segment) => segment.id === ids[0]) : null);

    setTimelineRangeSelection(selection);
    setSelectedTimelineSegmentIds(ids);
    setSelectedTimelineSegmentId(primary?.id ?? null);
    if (primary) {
      setSelectedItemId(primary.itemId);
    }
  }

  function clearSingularTimedItemSelection() {
    setSelectedZoomId(null);
    setSelectedSpeedId(null);
    setSelectedSubtitleId(null);
    setSelectedTextOverlayId(null);
  }

  function beginTimelineScrub(event: ReactPointerEvent<HTMLElement>) {
    if (anyClipDragActive()) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input, select, textarea")) {
      return;
    }

    if (event.currentTarget === timelineBodyRef.current) {
      const targetLane = target?.closest<HTMLElement>(".track-lane");
      const anchorLaneId = parseTimelineLaneId(
        targetLane?.closest<HTMLElement>("[data-timeline-lane]")?.dataset.timelineLane
      );
      if (!targetLane || !anchorLaneId) {
        return;
      }
      const time = getTimelineTimeFromClientX(event.clientX);
      if (time === null) {
        return;
      }
      clearSingularTimedItemSelection();
      setTimelineContextMenu(null);
      beginPlaybackInteraction();
      rangeSelectionDragRef.current = {
        anchorClientX: event.clientX,
        anchorClientY: event.clientY,
        anchorLaneId,
        anchorTime: time,
        moved: false
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setTimelineContextMenu(null);
    beginPlaybackInteraction();
    timelineDragRef.current = true;
    setScrubbingTimeline(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTimelinePointer(event.clientX);
  }

  function moveTimelineScrub(event: ReactPointerEvent<HTMLElement>) {
    if (rangeSelectionDragRef.current) {
      updateTimelineRangeSelection(event.clientX, event.clientY);
      return;
    }

    // While a clip/effect is being dragged, suppress the clip reflow transition
    // so it follows the pointer exactly (the transition animates drops instead).
    if (anyClipDragActive()) {
      timelineBodyRef.current?.setAttribute("data-interacting", "true");
    }

    if (updateEffectClipDrag(event.clientX)) {
      return;
    }

    if (updateMediaClipDrag(event.clientX)) {
      return;
    }

    if (!timelineDragRef.current) {
      return;
    }

    seekTimelinePointer(event.clientX);
  }

  function endTimelineScrub(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const rangeDrag = rangeSelectionDragRef.current;
    if (rangeDrag) {
      rangeSelectionDragRef.current = null;
      if (!rangeDrag.moved) {
        setTimelineRangeSelection(null);
        setSelectedTimelineSegmentIds([]);
        setSelectedTimelineSegmentId(null);
        seekTimelinePointer(event.clientX);
      }
      endPlaybackInteraction();
      return;
    }

    finishMediaClipDrags();
    finishEffectClipDrags();
    // Re-enable clip reflow animation so the drop settles smoothly.
    timelineBodyRef.current?.removeAttribute("data-interacting");
    timelineDragRef.current = false;
    setScrubbingTimeline(false);
    endPlaybackInteraction();
  }

  return {
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTextOverlayClipDrag,
    beginTimelineClipMove,
    beginTimelineClipTrim,
    beginTimelineScrub,
    beginZoomClipDrag,
    endTimelineScrub,
    moveTimelineScrub,
    openTimelineContextMenu
  };
}

function parseTimelineLaneId(value: string | undefined): TimelineLaneId | null {
  if (
    value === "video" ||
    value === "zoom" ||
    value === "speed" ||
    value === "subtitles" ||
    value === "text" ||
    (value !== undefined && /^audio:\d+$/.test(value))
  ) {
    return value as TimelineLaneId;
  }
  return null;
}
