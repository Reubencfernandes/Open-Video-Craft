/** Media clip move and trim interactions for the timeline. */
import { useRef } from "react";
import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction
} from "react";
import {
  areTimelineSegmentsEqual,
  getTimelineRangeSelectionForSegments,
  moveTimelineSegmentGroup,
  trimTimelineSegment
} from "./timeline-utils";
import type {
  TimelineRangeSelection,
  TimelineSegment,
  TimelineTrimDrag,
  TimelineTrimEdge
} from "./types";

type UseTimelineMediaDragInteractionsParams = {
  beginPlaybackInteraction: () => void;
  currentTimeRef: MutableRefObject<number>;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  mediaDurationById: Map<string, number>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  selectedTimelineSegmentIds: string[];
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentIds: Dispatch<SetStateAction<string[]>>;
  setTimelineRangeSelection: Dispatch<SetStateAction<TimelineRangeSelection | null>>;
  setTimelineRedoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineUndoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineRangeSelection: TimelineRangeSelection | null;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
};

export function useTimelineMediaDragInteractions(
  params: UseTimelineMediaDragInteractionsParams
) {
  const trimDragRef = useRef<TimelineTrimDrag | null>(null);
  const moveDragRef = useRef<{
    segmentId: string;
    segmentIds: string[];
    pointerStartTime: number;
    segmentStart: number;
    moved: boolean;
    originalSegments: TimelineSegment[];
    originalRangeSelection: TimelineRangeSelection | null;
  } | null>(null);

  function beginTimelineClipTrim(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) {
    event.preventDefault();
    event.stopPropagation();
    trimDragRef.current = {
      segmentId,
      edge,
      originalSegments: params.timelineSegments
    };
    params.beginPlaybackInteraction();
    params.setSelectedTimelineSegmentId(segmentId);
    params.setSelectedTimelineSegmentIds([segmentId]);
    params.setTimelineRangeSelection(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipTrim(clientX: number) {
    const drag = trimDragRef.current;
    const time = params.getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) return;

    params.setTimelineSegments((current) => {
      const next = trimTimelineSegment(
        current,
        drag.segmentId,
        drag.edge,
        time,
        params.mediaDurationById
      );
      if (!areTimelineSegmentsEqual(current, next)) {
        params.scheduleTimelinePlaybackSync(next);
      }
      return next;
    });
    params.seek(drag.edge === "start" ? time : Math.max(0, time - 1 / 30));
  }

  function finishTimelineClipTrim() {
    const drag = trimDragRef.current;
    if (!drag) return;

    params.setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        params.setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        params.setTimelineRedoStack([]);
      }
      return current;
    });
    trimDragRef.current = null;
  }

  function beginTimelineClipMove(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string
  ) {
    if (trimDragRef.current) return;

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const segment = params.timelineSegments.find((item) => item.id === segmentId);
    if (time === null || !segment) return;

    const movingIds = params.selectedTimelineSegmentIds.includes(segmentId)
      ? params.selectedTimelineSegmentIds
      : [segmentId];
    moveDragRef.current = {
      segmentId,
      segmentIds: movingIds,
      pointerStartTime: time,
      segmentStart: segment.start,
      moved: false,
      originalSegments: params.timelineSegments,
      originalRangeSelection:
        movingIds.length > 1 ? params.timelineRangeSelection : null
    };
    params.beginPlaybackInteraction();
    params.setSelectedTimelineSegmentId(segmentId);
    params.setSelectedTimelineSegmentIds(movingIds);
    if (movingIds.length === 1) params.setTimelineRangeSelection(null);
    params.seek(time);
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipMove(clientX: number) {
    const drag = moveDragRef.current;
    const time = params.getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) return;

    const delta = time - drag.pointerStartTime;
    if (!drag.moved && Math.abs(delta) < 0.02) return;

    drag.moved = true;
    const rawStart = Math.max(0, drag.segmentStart + delta);
    const rawDelta = rawStart - drag.segmentStart;
    params.setTimelineSegments((current) => {
      const next = moveTimelineSegmentGroup(
        drag.originalSegments,
        drag.segmentIds,
        rawDelta,
        params.timelineRenderDuration,
        [params.currentTimeRef.current]
      );
      if (!areTimelineSegmentsEqual(current, next)) {
        params.scheduleTimelinePlaybackSync(next);
      }
      if (drag.originalRangeSelection) {
        params.setTimelineRangeSelection(
          getTimelineRangeSelectionForSegments(next, drag.segmentIds)
        );
      }
      return next;
    });
  }

  function finishTimelineClipMove() {
    const drag = moveDragRef.current;
    if (!drag) return;

    moveDragRef.current = null;
    if (!drag.moved) return;

    params.setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(drag.originalSegments, current)) {
        params.setTimelineUndoStack((stack) => [...stack.slice(-49), drag.originalSegments]);
        params.setTimelineRedoStack([]);
      }
      return current;
    });
  }

  function isMediaClipDragActive() {
    return Boolean(trimDragRef.current || moveDragRef.current);
  }

  function updateMediaClipDrag(clientX: number) {
    if (trimDragRef.current) {
      updateTimelineClipTrim(clientX);
      return true;
    }
    if (moveDragRef.current) {
      updateTimelineClipMove(clientX);
      return true;
    }
    return false;
  }

  function finishMediaClipDrags() {
    finishTimelineClipTrim();
    finishTimelineClipMove();
  }

  return {
    beginTimelineClipMove,
    beginTimelineClipTrim,
    finishMediaClipDrags,
    isMediaClipDragActive,
    updateMediaClipDrag
  };
}
