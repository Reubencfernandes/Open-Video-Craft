/**
 * Timeline clip clipboard (Ctrl/Cmd+C / X / V).
 *
 * Only the placement is copied — media item id, source-window offset, length
 * and track kind — never the segment itself. Paste mints a fresh segment id
 * and drops the clip at the playhead, routed through the shared move logic so
 * it snaps to neighbors and never overlaps on the video track (audio clips
 * resolve onto a free lane instead).
 */
import { useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { moveTimelineSegment, resolveAudioLane } from "./timeline-utils";
import { createId } from "./utils";
import type { EditorMediaItem, TimelineSegment, TimelineTrackKind } from "./types";

type ClipboardEntry = {
  itemId: string;
  track: TimelineTrackKind;
  sourceStart: number;
  duration: number;
};

type UseTimelineClipboardParams = {
  commitTimelineSegments: (updater: (segments: TimelineSegment[]) => TimelineSegment[]) => void;
  currentTimeRef: MutableRefObject<number>;
  deleteSelectedTimelineSegment: () => void;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  mediaById: Map<string, EditorMediaItem>;
  selectedTimelineSegmentId: string | null;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
};

export function useTimelineClipboard(params: UseTimelineClipboardParams) {
  const {
    commitTimelineSegments,
    currentTimeRef,
    deleteSelectedTimelineSegment,
    knownTimelineItemIdsRef,
    mediaById,
    selectedTimelineSegmentId,
    setExportMessage,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    timelineRenderDuration,
    timelineSegments
  } = params;

  const timelineClipboardRef = useRef<ClipboardEntry | null>(null);

  function copySelectedTimelineSegment() {
    const segment = timelineSegments.find((item) => item.id === selectedTimelineSegmentId);
    if (!segment) {
      return;
    }

    timelineClipboardRef.current = {
      itemId: segment.itemId,
      track: segment.track,
      sourceStart: segment.sourceStart,
      duration: Math.max(0.1, segment.end - segment.start)
    };
    setExportMessage("Clip copied");
  }

  function cutSelectedTimelineSegment() {
    copySelectedTimelineSegment();
    deleteSelectedTimelineSegment();
  }

  function pasteTimelineSegment() {
    const clip = timelineClipboardRef.current;
    const item = clip ? mediaById.get(clip.itemId) : null;
    if (!clip || !item) {
      return;
    }

    const start = Math.max(0, currentTimeRef.current);
    const end = start + clip.duration;
    // The "itemId:segment-" id format is load-bearing: selection code maps a
    // segment back to its media item by splitting on ":segment-".
    const segmentId = `${clip.itemId}:segment-${createId("paste")}`;

    knownTimelineItemIdsRef.current.add(clip.itemId);
    commitTimelineSegments((segments) => {
      const draft: TimelineSegment = {
        id: segmentId,
        itemId: clip.itemId,
        track: clip.track,
        lane: clip.track === "audio" ? resolveAudioLane(segments, segmentId, start, end, 0) : 0,
        start,
        end,
        sourceStart: clip.sourceStart
      };
      // Route through move logic so the paste snaps and never overlaps a
      // neighbor on the video track (audio resolves onto a free lane).
      return moveTimelineSegment([...segments, draft], segmentId, start, timelineRenderDuration);
    });
    setSelectedItemId(clip.itemId);
    setSelectedTimelineSegmentId(segmentId);
    setExportMessage("Clip pasted");
  }

  return {
    copySelectedTimelineSegment,
    cutSelectedTimelineSegment,
    pasteTimelineSegment
  };
}
