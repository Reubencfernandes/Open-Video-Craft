/**
 * Media clip press, move and trim interactions for the timeline.
 *
 * A press selects the clip and never moves the playhead. It only becomes a
 * move once the pointer travels a few pixels, so a click cannot nudge a clip.
 * Moving or trimming a screen recording carries the recording's linked audio
 * along (hold Alt to edit the picture alone), keeping the voice in sync.
 */
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
  pushTimelineUndoSnapshot,
  snapTimelineTime
} from "./timeline-utils";
import {
  isolateLinkedRecordingAudio,
  trimTimelineSegmentWithLinkedAudio
} from "./timeline-links";
import { resolveTimelineClipPress, timelineDragThresholdPx } from "./timeline-selection";
import { createId } from "./utils";
import type {
  TimelineRangeSelection,
  TimelineSegment,
  TimelineTrimEdge
} from "./types";

/** Snap distance for clip edges, in CSS pixels. */
const snapDistancePx = 8;

export type ApplyTimelineClipSelection = (
  segmentIds: string[],
  primaryId: string | null,
  options?: { keepRange?: boolean }
) => void;

type UseTimelineMediaDragInteractionsParams = {
  applyTimelineClipSelection: ApplyTimelineClipSelection;
  beginPlaybackInteraction: () => void;
  currentTimeRef: MutableRefObject<number>;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  mediaDurationById: Map<string, number>;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  selectedTimelineSegmentIds: string[];
  setTimelineRangeSelection: Dispatch<SetStateAction<TimelineRangeSelection | null>>;
  setTimelineRedoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineUndoStack: Dispatch<SetStateAction<TimelineSegment[][]>>;
  timelineBodyRef: RefObject<HTMLDivElement | null>;
  timelineRangeSelection: TimelineRangeSelection | null;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
};

type TrimDrag = {
  segmentId: string;
  edge: TimelineTrimEdge;
  linked: boolean;
  pointerStartClientX: number;
  /** Edge time minus pointer time at the press, so the edge never jumps. */
  grabOffset: number;
  playheadTime: number;
  moved: boolean;
  originalSegments: TimelineSegment[];
  baseSegments: TimelineSegment[];
  linkedIds: string[];
  lastSegments: TimelineSegment[];
};

type MoveDrag = {
  segmentId: string;
  segmentIds: string[];
  linked: boolean;
  pointerStartClientX: number;
  pointerStartTime: number;
  segmentStart: number;
  moved: boolean;
  collapseOnRelease: boolean;
  originalSegments: TimelineSegment[];
  baseSegments: TimelineSegment[];
  movingIds: string[];
  originalRangeSelection: TimelineRangeSelection | null;
  lastSegments: TimelineSegment[];
};

function createLinkedSegmentId(sourceId: string): string {
  return `${sourceId}-split-${createId("clip")}`;
}

export function useTimelineMediaDragInteractions(
  params: UseTimelineMediaDragInteractionsParams
) {
  const trimDragRef = useRef<TrimDrag | null>(null);
  const moveDragRef = useRef<MoveDrag | null>(null);

  function getSnapThresholdSeconds(): number | undefined {
    const lane = params.timelineBodyRef.current?.querySelector<HTMLElement>(".track-lane");
    const width = lane?.getBoundingClientRect().width ?? 0;
    return width > 0 ? (params.timelineRenderDuration / width) * snapDistancePx : undefined;
  }

  function applySegments(drag: { lastSegments: TimelineSegment[] }, next: TimelineSegment[]) {
    if (areTimelineSegmentsEqual(drag.lastSegments, next)) return;
    drag.lastSegments = next;
    params.scheduleTimelinePlaybackSync(next);
    params.setTimelineSegments(next);
  }

  function pushUndoEntry(originalSegments: TimelineSegment[]) {
    params.setTimelineSegments((current) => {
      if (!areTimelineSegmentsEqual(originalSegments, current)) {
        params.setTimelineUndoStack((stack) => pushTimelineUndoSnapshot(stack, originalSegments));
        params.setTimelineRedoStack([]);
      }
      return current;
    });
  }

  function beginTimelineClipTrim(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const segment = params.timelineSegments.find((item) => item.id === segmentId);
    const time = params.getTimelineTimeFromClientX(event.clientX);
    if (!segment || time === null) return;

    trimDragRef.current = {
      segmentId,
      edge,
      linked: !event.altKey,
      pointerStartClientX: event.clientX,
      grabOffset: (edge === "start" ? segment.start : segment.end) - time,
      playheadTime: params.currentTimeRef.current,
      moved: false,
      originalSegments: params.timelineSegments,
      baseSegments: params.timelineSegments,
      linkedIds: [],
      lastSegments: params.timelineSegments
    };
    params.applyTimelineClipSelection([segmentId], segmentId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipTrim(clientX: number) {
    const drag = trimDragRef.current;
    const time = params.getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) return;
    if (!drag.moved && Math.abs(clientX - drag.pointerStartClientX) < timelineDragThresholdPx) {
      return;
    }

    if (!drag.moved) {
      drag.moved = true;
      params.beginPlaybackInteraction();
      if (drag.linked) {
        const isolated = isolateLinkedRecordingAudio(
          drag.originalSegments,
          [drag.segmentId],
          createLinkedSegmentId
        );
        drag.baseSegments = isolated.segments;
        drag.linkedIds = isolated.linkedIds;
      }
    }

    const ignored = new Set([drag.segmentId, ...drag.linkedIds]);
    const snapTargets = [
      drag.playheadTime,
      ...drag.baseSegments
        .filter((segment) => !ignored.has(segment.id))
        .flatMap((segment) => [segment.start, segment.end])
    ];
    const threshold = getSnapThresholdSeconds();
    const edgeTime = threshold === undefined
      ? time + drag.grabOffset
      : snapTimelineTime(time + drag.grabOffset, snapTargets, threshold);
    const next = trimTimelineSegmentWithLinkedAudio(
      drag.baseSegments,
      drag.segmentId,
      drag.edge,
      edgeTime,
      params.mediaDurationById,
      drag.linkedIds
    );
    applySegments(drag, next);

    // Preview the frame at the edge being trimmed.
    const trimmed = next.find((segment) => segment.id === drag.segmentId);
    if (trimmed) {
      params.seek(
        drag.edge === "start"
          ? trimmed.start
          : Math.max(trimmed.start, trimmed.end - 1 / 30)
      );
    }
  }

  function finishTimelineClipTrim() {
    const drag = trimDragRef.current;
    if (!drag) return;

    trimDragRef.current = null;
    if (!drag.moved) return;
    pushUndoEntry(drag.originalSegments);
    // The edge preview borrowed the playhead; give it back where it was.
    params.seek(drag.playheadTime);
  }

  function beginTimelineClipMove(
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string
  ) {
    if (event.button !== 0 || trimDragRef.current) return;

    const time = params.getTimelineTimeFromClientX(event.clientX);
    const segment = params.timelineSegments.find((item) => item.id === segmentId);
    if (time === null || !segment) return;

    const press = resolveTimelineClipPress(
      params.selectedTimelineSegmentIds,
      segmentId,
      event.ctrlKey || event.metaKey || event.shiftKey
    );
    params.applyTimelineClipSelection(press.ids, press.primaryId, {
      keepRange: press.keepRange
    });
    if (!press.draggable) return;

    moveDragRef.current = {
      segmentId,
      segmentIds: press.ids,
      linked: !event.altKey,
      pointerStartClientX: event.clientX,
      pointerStartTime: time,
      segmentStart: segment.start,
      moved: false,
      collapseOnRelease: press.collapseOnRelease,
      originalSegments: params.timelineSegments,
      baseSegments: params.timelineSegments,
      movingIds: press.ids,
      originalRangeSelection:
        press.keepRange && press.ids.length > 1 ? params.timelineRangeSelection : null,
      lastSegments: params.timelineSegments
    };
    params.timelineBodyRef.current?.setPointerCapture(event.pointerId);
  }

  function updateTimelineClipMove(clientX: number) {
    const drag = moveDragRef.current;
    const time = params.getTimelineTimeFromClientX(clientX);
    if (!drag || time === null) return;
    if (!drag.moved && Math.abs(clientX - drag.pointerStartClientX) < timelineDragThresholdPx) {
      return;
    }

    if (!drag.moved) {
      drag.moved = true;
      params.beginPlaybackInteraction();
      if (drag.linked) {
        const videoIds = drag.segmentIds.filter(
          (id) => drag.originalSegments.find((segment) => segment.id === id)?.track === "video"
        );
        const isolated = isolateLinkedRecordingAudio(
          drag.originalSegments,
          videoIds,
          createLinkedSegmentId,
          new Set(drag.segmentIds)
        );
        drag.baseSegments = isolated.segments;
        drag.movingIds = [...new Set([...drag.segmentIds, ...isolated.linkedIds])];
      }
    }

    const rawStart = Math.max(0, drag.segmentStart + time - drag.pointerStartTime);
    const next = moveTimelineSegmentGroup(
      drag.baseSegments,
      drag.movingIds,
      rawStart - drag.segmentStart,
      params.timelineRenderDuration,
      [params.currentTimeRef.current],
      getSnapThresholdSeconds()
    );
    applySegments(drag, next);
    if (drag.originalRangeSelection) {
      params.setTimelineRangeSelection(
        getTimelineRangeSelectionForSegments(next, drag.segmentIds)
      );
    }
  }

  function finishTimelineClipMove() {
    const drag = moveDragRef.current;
    if (!drag) return;

    moveDragRef.current = null;
    if (!drag.moved) {
      // A plain click inside a group selects just that clip, like other editors.
      if (drag.collapseOnRelease) {
        params.applyTimelineClipSelection([drag.segmentId], drag.segmentId);
      }
      return;
    }
    pushUndoEntry(drag.originalSegments);
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
