/**
 * The timeline's editing core:
 *
 *   - `commitTimelineSegments` — the single write path for segment edits, so
 *     every change lands on the undo stack (owned here) exactly once.
 *   - undo/redo, delete, split, and drag & drop from the asset grid.
 *   - Housekeeping effects that keep the timeline consistent with the media
 *     library: auto-adding project recordings, probing unknown media
 *     durations, growing the rendered scale, keeping the export trim range
 *     sensible, and defaulting the selected asset.
 *
 * The undo/redo stacks live here as private state; interaction hooks that
 * record undo entries during drags receive the stack setters from this hook.
 */
import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  MutableRefObject,
  SetStateAction
} from "react";
import {
  areTimelineSegmentsEqual,
  getTimelineMediaDuration,
  getTimelineTrackKind,
  moveTimelineSegment,
  resolveAudioLane,
  syncTimelineSegments
} from "./timeline-utils";
import { splitTimelineSegments } from "./timeline-split";
import { createId } from "./utils";
import { mediaDragType, textDragType } from "./types";
import type {
  EditorMediaItem,
  TimelineContextMenu,
  TimelineSegment
} from "./types";

type UseTimelineEditingParams = {
  activeDuration: number;
  audioElsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  getTimelineTimeFromClientX: (clientX: number) => number | null;
  isEditorStateReady: boolean;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  mediaById: Map<string, EditorMediaItem>;
  mediaDurationById: Map<string, number>;
  onDropNewTextOverlay: (time: number) => void;
  scheduleTimelinePlaybackSync: (segments: TimelineSegment[]) => void;
  seek: (time: number) => void;
  selectedItemId: string | null;
  selectedTimelineItemId: string | null;
  selectedTimelineSegmentId: string | null;
  allMedia: EditorMediaItem[];
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineViewDuration: Dispatch<SetStateAction<number>>;
  setTrimRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  timelineDuration: number;
  timelineEditableItems: EditorMediaItem[];
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  updateMediaDuration: (itemId: string, duration: number | null) => void;
};

export function useTimelineEditing(params: UseTimelineEditingParams) {
  const {
    activeDuration,
    audioElsRef,
    getTimelineTimeFromClientX,
    isEditorStateReady,
    knownTimelineItemIdsRef,
    mediaById,
    mediaDurationById,
    onDropNewTextOverlay,
    scheduleTimelinePlaybackSync,
    seek,
    selectedItemId,
    selectedTimelineItemId,
    selectedTimelineSegmentId,
    allMedia,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    setTimelineContextMenu,
    setTimelineSegments,
    setTimelineViewDuration,
    setTrimRange,
    timelineDuration,
    timelineEditableItems,
    timelineRenderDuration,
    timelineSegments,
    updateMediaDuration
  } = params;

  const [timelineUndoStack, setTimelineUndoStack] = useState<TimelineSegment[][]>([]);
  const [timelineRedoStack, setTimelineRedoStack] = useState<TimelineSegment[][]>([]);
  const previousTimelineDurationRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Library housekeeping effects.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedItemId && allMedia.length > 0) {
      setSelectedItemId(allMedia[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMedia, selectedItemId]);

  // Keep timeline segments consistent with the media library.
  useEffect(() => {
    if (!isEditorStateReady) {
      return;
    }

    const availableItemIds = new Set(timelineEditableItems.map((item) => item.id));
    const nextKnownItemIds = new Set(
      [...knownTimelineItemIdsRef.current].filter((itemId) => availableItemIds.has(itemId))
    );
    // Only project recordings load onto the timeline automatically; imported
    // media stays in the asset grid until it is dragged onto the timeline.
    const newItemIds = new Set(
      timelineEditableItems
        .filter((item) => item.origin === "project")
        .map((item) => item.id)
        .filter((itemId) => !nextKnownItemIds.has(itemId))
    );

    for (const itemId of newItemIds) {
      nextKnownItemIds.add(itemId);
    }
    knownTimelineItemIdsRef.current = nextKnownItemIds;

    setTimelineSegments((current) =>
      syncTimelineSegments(
        current,
        timelineEditableItems,
        mediaDurationById,
        newItemIds
      )
    );
    setSelectedTimelineSegmentId((current) =>
      current && availableItemIds.has(current.split(":segment-")[0]) ? current : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditorStateReady, mediaDurationById, timelineEditableItems]);

  // Probe durations for media whose length is still unknown (throwaway
  // elements; the real duration lands in the library via updateMediaDuration).
  useEffect(() => {
    const unresolvedMedia = timelineEditableItems.filter(
      (item) => item.kind !== "image" && (!item.duration || item.duration <= 0)
    );
    if (unresolvedMedia.length === 0) {
      return undefined;
    }

    const cleanups = unresolvedMedia.map((item) => {
      const element = document.createElement(item.kind === "audio" ? "audio" : "video");
      const reportDuration = () => updateMediaDuration(item.id, element.duration);
      element.preload = "metadata";
      element.addEventListener("loadedmetadata", reportDuration);
      element.addEventListener("durationchange", reportDuration);
      element.src = item.url;
      element.load();

      return () => {
        element.removeEventListener("loadedmetadata", reportDuration);
        element.removeEventListener("durationchange", reportDuration);
        element.removeAttribute("src");
        element.load();
      };
    });

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineEditableItems]);

  // Grow (never shrink) the rendered timeline scale as content grows.
  useEffect(() => {
    setTimelineViewDuration((current) => Math.max(current, timelineDuration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineDuration]);

  // Keep the export trim range sensible as the timeline duration changes.
  useEffect(() => {
    if (timelineDuration <= 0) {
      return;
    }

    const previousTimelineDuration = previousTimelineDurationRef.current;
    setTrimRange((current) => {
      const shouldUseFullDuration =
        current.end <= 0 ||
        Math.abs(current.end - previousTimelineDuration) < 0.05 ||
        (previousTimelineDuration <= 1.05 && current.end <= 1.05 && timelineDuration > 1.05);
      const start = Math.min(current.start, timelineDuration);
      const end = shouldUseFullDuration
        ? timelineDuration
        : Math.min(Math.max(current.end, start + 0.1), timelineDuration);

      return {
        start,
        end
      };
    });
    previousTimelineDurationRef.current = timelineDuration;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineDuration]);

  // ---------------------------------------------------------------------------
  // Commit + undo/redo.
  // ---------------------------------------------------------------------------

  // All segment edits flow through here so each change lands on the undo stack.
  function commitTimelineSegments(updater: (segments: TimelineSegment[]) => TimelineSegment[]) {
    setTimelineSegments((current) => {
      const next = updater(current);
      if (areTimelineSegmentsEqual(current, next)) {
        return current;
      }

      scheduleTimelinePlaybackSync(next);
      setTimelineUndoStack((stack) => [...stack.slice(-49), current]);
      setTimelineRedoStack([]);
      return next;
    });
  }

  function undoTimelineEdit() {
    if (timelineUndoStack.length === 0) {
      return;
    }

    const previous = timelineUndoStack[timelineUndoStack.length - 1];
    setTimelineUndoStack((stack) => stack.slice(0, -1));
    setTimelineRedoStack((stack) => [timelineSegments, ...stack.slice(0, 49)]);
    scheduleTimelinePlaybackSync(previous);
    setTimelineSegments(previous);
    setSelectedTimelineSegmentId(null);
  }

  function redoTimelineEdit() {
    if (timelineRedoStack.length === 0) {
      return;
    }

    const next = timelineRedoStack[0];
    setTimelineRedoStack((stack) => stack.slice(1));
    setTimelineUndoStack((stack) => [...stack.slice(-49), timelineSegments]);
    scheduleTimelinePlaybackSync(next);
    setTimelineSegments(next);
    setSelectedTimelineSegmentId(null);
  }

  // ---------------------------------------------------------------------------
  // Delete + split.
  // ---------------------------------------------------------------------------

  function deleteTimelineSegment(segmentId: string | null) {
    if (!segmentId) {
      return;
    }

    const audioElement = audioElsRef.current.get(segmentId);
    audioElement?.pause();
    commitTimelineSegments((segments) => segments.filter((segment) => segment.id !== segmentId));
    setSelectedTimelineSegmentId((current) => (current === segmentId ? null : current));
    setTimelineContextMenu(null);
  }

  function deleteSelectedTimelineSegment() {
    deleteTimelineSegment(selectedTimelineSegmentId);
  }

  function splitTimelineSegment(segmentId: string | null, time: number) {
    const result = splitTimelineSegments(timelineSegments, segmentId, time);
    if (!result) {
      setTimelineContextMenu(null);
      return;
    }

    commitTimelineSegments(() => result.segments);
    // Keep the original half selected and preview it from its beginning. This
    // avoids the split action unexpectedly leaving playback on the right half.
    setSelectedTimelineSegmentId(result.left.id);
    window.queueMicrotask(() => seek(result.left.start));
    setTimelineContextMenu(null);
  }

  // ---------------------------------------------------------------------------
  // Drag & drop from the asset grid onto the timeline.
  // ---------------------------------------------------------------------------

  function handleTimelineDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (
      event.dataTransfer.types.includes(mediaDragType) ||
      event.dataTransfer.types.includes(textDragType)
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleTimelineDrop(event: ReactDragEvent<HTMLDivElement>) {
    const dropTime = getTimelineTimeFromClientX(event.clientX);
    if (dropTime === null) {
      return;
    }

    // A drag from the text panel creates a new text overlay at the drop time.
    if (event.dataTransfer.types.includes(textDragType)) {
      event.preventDefault();
      onDropNewTextOverlay(dropTime);
      return;
    }

    const itemId = event.dataTransfer.getData(mediaDragType);
    const item = itemId ? mediaById.get(itemId) : null;
    if (!item) {
      return;
    }

    event.preventDefault();
    addTimelineClipAt(item, dropTime);
  }

  // Adds a new clip for the media item at the drop position. The same asset
  // can be dropped multiple times to build a multi-clip sequence.
  function addTimelineClipAt(item: EditorMediaItem, dropTime: number) {
    if (item.track === "camera") {
      return;
    }

    const track = getTimelineTrackKind(item);
    const itemDuration = Math.max(
      0.1,
      mediaDurationById.get(item.id) ??
      getTimelineMediaDuration(item, activeDuration, selectedTimelineItemId)
    );
    const start = Math.max(0, dropTime);
    const end = start + itemDuration;
    // The "itemId:segment-" id format is load-bearing: selection code maps a
    // segment back to its media item by splitting on ":segment-".
    const segmentId = `${item.id}:segment-${createId("drop")}`;

    knownTimelineItemIdsRef.current.add(item.id);
    commitTimelineSegments((segments) => {
      const draft: TimelineSegment = {
        id: segmentId,
        itemId: item.id,
        track,
        lane: track === "audio" ? resolveAudioLane(segments, segmentId, start, end, 0) : 0,
        start,
        end,
        sourceStart: 0
      };
      // Route through the move logic so drops snap to clip edges like drags do.
      return moveTimelineSegment([...segments, draft], segmentId, start, timelineRenderDuration);
    });
    setSelectedItemId(item.id);
    setSelectedTimelineSegmentId(segmentId);
  }

  return {
    commitTimelineSegments,
    deleteSelectedTimelineSegment,
    deleteTimelineSegment,
    handleTimelineDragOver,
    handleTimelineDrop,
    redoTimelineEdit,
    setTimelineRedoStack,
    setTimelineUndoStack,
    splitTimelineSegment,
    undoTimelineEdit
  };
}
