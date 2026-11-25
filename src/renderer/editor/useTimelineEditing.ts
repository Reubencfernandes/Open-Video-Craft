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
  canSplitTimelineSegment,
  getTimelineMediaDuration,
  getSnappedInsertStart,
  getTimelinePackAnchor,
  getTimelineTrackKind,
  moveTimelineSegment,
  packTimelineSegments,
  resolveAudioLane,
  swapTimelineVideoChannels,
  syncTimelineSegments
} from "./timeline-utils";
import { removeTimelineSegmentsWithLinkedAudio } from "./timeline-links";
import { splitTimelineSegments } from "./timeline-split";
import { createId } from "./utils";
import { mediaDragType, textDragType } from "./types";
import type {
  CameraClipStyle,
  EditorMediaItem,
  LayoutMode,
  SpeedEffect,
  TimelineContextMenu,
  TimelineRangeSelection,
  TimelineSegment
} from "./types";

type UseTimelineEditingParams = {
  /** Optional so the clamp knows how much a slowed clip stretches. */
  speedEffects?: SpeedEffect[];
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
  selectedTimelineSegmentIds: string[];
  allMedia: EditorMediaItem[];
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentIds: Dispatch<SetStateAction<string[]>>;
  setTimelineContextMenu: Dispatch<SetStateAction<TimelineContextMenu>>;
  setTimelineRangeSelection: Dispatch<SetStateAction<TimelineRangeSelection | null>>;
  setTimelineSegments: Dispatch<SetStateAction<TimelineSegment[]>>;
  setTimelineViewDuration: Dispatch<SetStateAction<number>>;
  setTrimRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  timelineDuration: number;
  /** True while a clip or effect drag owns the pointer. */
  timelineDragActive?: boolean;
  timelineEditableItems: EditorMediaItem[];
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
  timelineViewDuration?: number;
  updateMediaDuration: (itemId: string, duration: number | null) => void;
};

// Split ids keep the load-bearing "itemId:segment-" prefix of their source.
function createSplitSegmentId(sourceId: string): string {
  return `${sourceId}-split-${createId("clip")}`;
}

/**
 * The clips a timeline Hide/Show command addresses. The menu is opened on one
 * clip: a right-click inside the selection (or on empty space, which keeps the
 * selection) acts on all of it, while a right-click on another clip has already
 * re-targeted the selection to that clip, so the command follows it.
 */
export function resolveVisibilityToggleClipIds(
  selectedIds: readonly string[],
  targetId: string | null
): string[] {
  if (targetId) {
    return selectedIds.includes(targetId) ? [...selectedIds] : [targetId];
  }
  return [...selectedIds];
}

/**
 * Whether a Hide/Show command should read "Show": true only when every clip it
 * addresses is already deactivated, so a mixed selection is hidden first.
 */
export function areTimelineSegmentsHidden(
  segments: readonly TimelineSegment[],
  ids: readonly string[]
): boolean {
  const targets = new Set(ids);
  const addressed = segments.filter((segment) => targets.has(segment.id));
  return addressed.length > 0 && addressed.every((segment) => segment.hidden === true);
}

export function useTimelineEditing(params: UseTimelineEditingParams) {
  const speedEffectsRef = useRef<readonly SpeedEffect[]>([]);
  speedEffectsRef.current = params.speedEffects ?? [];
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
  speedEffects,
    selectedTimelineItemId,
    selectedTimelineSegmentId,
    selectedTimelineSegmentIds,
    allMedia,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds,
    setTimelineContextMenu,
    setTimelineRangeSelection,
    setTimelineSegments,
    setTimelineViewDuration,
    setTrimRange,
    timelineDuration,
    timelineDragActive = false,
    timelineEditableItems,
    timelineRenderDuration,
    timelineSegments,
    timelineViewDuration = 0,
    updateMediaDuration
  } = params;

  const [timelineUndoStack, setTimelineUndoStack] = useState<TimelineSegment[][]>([]);
  const [timelineRedoStack, setTimelineRedoStack] = useState<TimelineSegment[][]>([]);
  const previousTimelineDurationRef = useRef(0);
  // Whether the visible ruler hugs the content end, as opposed to a deliberate
  // user extension. Only sampled between drags, so a drag cannot change it.
  const viewFittedToContentRef = useRef(true);

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
        newItemIds,
        speedEffectsRef.current
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

  useEffect(() => {
    if (!timelineDragActive) {
      viewFittedToContentRef.current =
        timelineViewDuration <= 0 || Math.abs(timelineViewDuration - timelineDuration) < 0.05;
    }
    // Sampled when the view changes, never because the content did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineViewDuration]);

  // Follow the content end in both directions while the ruler is fitted to
  // the composition. Preserve a deliberate user extension, but never let the
  // ruler become shorter than the current content.
  //
  // While a drag is active the ruler may grow but never shrink: shrinking
  // rescales time under the pointer, so trimming the last clip's end made the
  // edge run away from the cursor. It refits once the drag ends.
  useEffect(() => {
    setTimelineViewDuration((current) => {
      if (timelineDragActive) {
        return Math.max(current, timelineDuration);
      }
      return current <= 0 || viewFittedToContentRef.current
        ? timelineDuration
        : Math.max(current, timelineDuration);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineDuration, timelineDragActive]);

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
    setSelectedTimelineSegmentIds([]);
    setTimelineRangeSelection(null);
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
    setSelectedTimelineSegmentIds([]);
    setTimelineRangeSelection(null);
  }

  // ---------------------------------------------------------------------------
  // Delete + split.
  // ---------------------------------------------------------------------------

  type DeleteOptions = { linked?: boolean };

  // Deleting a clip removes only that clip. Pass `{ linked: true }` to also
  // drop the recording's audio in the same range.
  function removeTimelineSegments(ids: readonly string[], options: DeleteOptions = {}) {
    const result = removeTimelineSegmentsWithLinkedAudio(
      timelineSegments,
      ids,
      createSplitSegmentId,
      options
    );
    for (const id of [...ids, ...result.removedIds]) {
      audioElsRef.current.get(id)?.pause();
    }
    commitTimelineSegments((segments) =>
      removeTimelineSegmentsWithLinkedAudio(segments, ids, createSplitSegmentId, options).segments
    );
  }

  function deleteTimelineSegment(segmentId: string | null, options: DeleteOptions = {}) {
    if (!segmentId) {
      return;
    }

    removeTimelineSegments([segmentId], options);
    setSelectedTimelineSegmentId((current) => (current === segmentId ? null : current));
    setSelectedTimelineSegmentIds((current) => current.filter((id) => id !== segmentId));
    setTimelineRangeSelection(null);
    setTimelineContextMenu(null);
  }

  function deleteSelectedTimelineSegment(options: DeleteOptions = {}) {
    const ids = selectedTimelineSegmentIds.length > 0
      ? selectedTimelineSegmentIds
      : selectedTimelineSegmentId
        ? [selectedTimelineSegmentId]
        : [];
    if (ids.length === 0) {
      return;
    }

    removeTimelineSegments(ids, options);
    setSelectedTimelineSegmentId(null);
    setSelectedTimelineSegmentIds([]);
    setTimelineRangeSelection(null);
    setTimelineContextMenu(null);
  }


  /**
   * Deactivates or reactivates the selected clips. A deactivated clip keeps its
   * place on the timeline, so the recording range is never lost, but the canvas
   * and the export skip it — this is how the owner picks which recorded channel
   * is on screen. Passing `targetIds` acts on exactly those clips, which is what
   * the timeline menu does when it addresses the clip it was opened on.
   */
  function toggleSelectedTimelineHidden(targetIds?: readonly string[]) {
    const ids = targetIds && targetIds.length > 0
      ? [...targetIds]
      : resolveVisibilityToggleClipIds(
          selectedTimelineSegmentIds.length > 0
            ? selectedTimelineSegmentIds
            : selectedTimelineSegmentId
              ? [selectedTimelineSegmentId]
              : [],
          null
        );
    if (ids.length === 0) {
      return;
    }
    const targets = new Set(ids);
    commitTimelineSegments((segments) => {
      const shouldHide = segments.some(
        (segment) => targets.has(segment.id) && segment.hidden !== true
      );
      return segments.map((segment) => {
        if (!targets.has(segment.id)) return segment;
        const { hidden: _hidden, ...rest } = segment;
        return shouldHide ? { ...rest, hidden: true } : rest;
      });
    });
    setTimelineContextMenu(null);
  }

  /** Ids a per-clip command addresses: the multi-selection, else the one clip. */
  function selectedClipIds(): string[] {
    return selectedTimelineSegmentIds.length > 0
      ? selectedTimelineSegmentIds
      : selectedTimelineSegmentId
        ? [selectedTimelineSegmentId]
        : [];
  }

  /**
   * Gives the selected video clips the project layout, or removes their own so
   * the project layout applies again. This is what lets one video switch layouts
   * from clip to clip.
   */
  function setSelectedClipsLayout(layout: LayoutMode | null, currentLayout: LayoutMode) {
    const ids = selectedClipIds();
    if (ids.length === 0) return;
    const targets = new Set(ids);
    commitTimelineSegments((segments) =>
      segments.map((segment) => {
        if (!targets.has(segment.id) || segment.track !== "video") return segment;
        const { layout: _layout, ...rest } = segment;
        return layout === null ? rest : { ...rest, layout: layout ?? currentLayout };
      })
    );
    setTimelineContextMenu(null);
  }

  /**
   * Gives the selected video clips the current webcam shape/border, or removes
   * their own so the project style applies again. Together with the layout
   * override this lets one video change style from clip to clip.
   */
  function setSelectedClipsCameraStyle(style: CameraClipStyle | null) {
    const ids = selectedClipIds();
    if (ids.length === 0) return;
    const targets = new Set(ids);
    const clipStyle: CameraClipStyle | null = style === null
      ? null
      : {
          ...(style.shape === undefined ? {} : { shape: style.shape }),
          ...(style.border === undefined ? {} : { border: style.border })
        };
    commitTimelineSegments((segments) =>
      segments.map((segment) => {
        if (!targets.has(segment.id) || segment.track !== "video") return segment;
        const { cameraStyle: _cameraStyle, ...rest } = segment;
        return clipStyle === null ? rest : { ...rest, cameraStyle: clipStyle };
      })
    );
    setTimelineContextMenu(null);
  }

  /** Selects every timeline clip so one action can address all of them. */
  function selectAllTimelineClips() {
    setSelectedTimelineSegmentIds(timelineSegments.map((segment) => segment.id));
    setSelectedTimelineSegmentId(null);
    setTimelineRangeSelection(null);
  }

  /** Swaps two adjacent video channels without changing clip timing. */
  function swapVideoChannels(firstLane: number, secondLane: number) {
    commitTimelineSegments((segments) =>
      swapTimelineVideoChannels(segments, firstLane, secondLane)
    );
    setTimelineContextMenu(null);
  }

  /** Shows or hides every clip of one video channel at once. */
  function toggleVideoLaneVisibility(lane: number) {
    commitTimelineSegments((segments) => {
      const laneClips = segments.filter(
        (segment) => segment.track === "video" && segment.lane === lane
      );
      if (laneClips.length === 0) return segments;
      const hide = laneClips.some((segment) => segment.hidden !== true);
      return segments.map((segment) => {
        if (segment.track !== "video" || segment.lane !== lane) return segment;
        const { hidden: _hidden, ...rest } = segment;
        return hide ? { ...rest, hidden: true } : rest;
      });
    });
    setTimelineContextMenu(null);
  }

  /**
   * Quick cleanup: packs the selected clips back to back, removing empty space
   * between them and at their start. Without a selection every visible video
   * clip packs from zero, so the leading and trailing gaps disappear too.
   */
  function closeTimelineGaps(targetIds?: readonly string[]) {
    const explicit = targetIds ? [...targetIds] : [];
    const selected = explicit.length > 0
      ? explicit
      : selectedTimelineSegmentIds.length > 0
        ? selectedTimelineSegmentIds
        : selectedTimelineSegmentId
          ? [selectedTimelineSegmentId]
          : [];
    commitTimelineSegments((segments) => {
      const ids = selected.length > 0
        ? selected
        : segments.filter((segment) => segment.track === "video" && segment.hidden !== true)
            .map((segment) => segment.id);
      return packTimelineSegments(segments, ids, getTimelinePackAnchor(segments, ids));
    });
    setTimelineContextMenu(null);
  }

  /**
   * Cuts every selected clip at the same moment, so a multi-selection splits in
   * one undoable step instead of one clip at a time.
   */
  function splitSelectedTimelineSegments(time: number, targetIds?: readonly string[]) {
    const ids = targetIds
      ? targetIds
      : selectedTimelineSegmentIds.length > 0
      ? selectedTimelineSegmentIds
      : selectedTimelineSegmentId
        ? [selectedTimelineSegmentId]
        : [];
    if (ids.length === 0) {
      setTimelineContextMenu(null);
      return;
    }
    const splitApplied = ids.some((id) => {
      const segment = timelineSegments.find((item) => item.id === id);
      return segment !== undefined && canSplitTimelineSegment(segment, time);
    });
    commitTimelineSegments((segments) => {
      let next = segments;
      for (const id of ids) {
        const current = next.find((segment) => segment.id === id);
        if (!current || !canSplitTimelineSegment(current, time)) continue;
        const result = splitTimelineSegments(next, id, time, createSplitSegmentId);
        if (result) next = result.segments;
      }
      // Nothing splittable leaves the segments array untouched, so the commit
      // is a no-op: no undo entry and no selection change.
      return next;
    });
    if (splitApplied) parkPlayheadAt(time);
    setTimelineContextMenu(null);
  }

  /**
   * Split whatever is selected at one time: every selected clip for a
   * multi-selection, otherwise the single clip exactly as the toolbar always
   * did, including its fallback to the clip under the playhead.
   */
  function parkPlayheadAt(time: number) {
    window.queueMicrotask(() => seek(time));
  }

  function splitSelectionAtPlayhead(time: number) {
    if (selectedTimelineSegmentIds.length > 1) {
      splitSelectedTimelineSegments(time, selectedTimelineSegmentIds);
      return;
    }
    splitTimelineSegment(selectedTimelineSegmentId, time);
  }

  function splitTimelineSegment(segmentId: string | null, time: number) {
    const result = splitTimelineSegments(
      timelineSegments,
      segmentId,
      time,
      createSplitSegmentId
    );
    if (!result) {
      setTimelineContextMenu(null);
      return;
    }

    commitTimelineSegments(() => result.segments);
    // Select the newly created right half so the cut is immediately visible
    // and keep the preview parked exactly on the new edit point.
    setSelectedTimelineSegmentId(result.right.id);
    setSelectedTimelineSegmentIds([result.right.id]);
    setTimelineRangeSelection(null);
    parkPlayheadAt(result.splitTime);
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
    const knownDuration = mediaDurationById.get(item.id) ??
      getTimelineMediaDuration(item, activeDuration, selectedTimelineItemId);
    const itemDuration = knownDuration > 0 ? knownDuration : 1;
    const start = getSnappedInsertStart(
      timelineSegments, track, dropTime, itemDuration, timelineRenderDuration
    );
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
        sourceStart: 0,
        ...(knownDuration > 0 ? {} : { pendingDuration: true })
      };
      // Route through the move logic so drops snap to clip edges like drags do.
      return moveTimelineSegment([...segments, draft], segmentId, start, timelineRenderDuration);
    });
    setSelectedItemId(item.id);
    setSelectedTimelineSegmentId(segmentId);
    setSelectedTimelineSegmentIds([segmentId]);
    setTimelineRangeSelection(null);
  }

  return {
    commitTimelineSegments,
    closeTimelineGaps,
    selectAllTimelineClips,
    setSelectedClipsLayout,
    setSelectedClipsCameraStyle,
    toggleVideoLaneVisibility,
    swapVideoChannels,
    splitSelectedTimelineSegments,
    splitSelectionAtPlayhead,
    toggleSelectedTimelineHidden,
    createSplitSegmentId,
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
