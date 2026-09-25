/**
 * Timeline clip clipboard (Ctrl/Cmd+C / X / V).
 *
 * Only the placement is copied — media item id, source-window offset, length
 * and track kind — never the segment itself. Paste mints a fresh segment id
 * and drops the clip at the playhead, routed through the shared move logic so
 * it snaps to neighbors and never overlaps on the video track (audio clips
 * resolve onto a free lane instead).
 *
 * A screen recording clip is copied with the slice of its linked mic/system
 * audio, and pasted back in sync, so Cut + Paste moves the voice with it.
 */
import { useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getLinkedRecordingAudioIds } from "./timeline-links";
import { moveTimelineSegment, normalizeAudioLanes, resolveAudioLane } from "./timeline-utils";
import { createId } from "./utils";
import type { EditorMediaItem, TimelineSegment, TimelineTrackKind } from "./types";

type ClipboardAudio = {
  itemId: string;
  sourceStart: number;
  duration: number;
  /** Start relative to the copied clip's start. */
  offset: number;
  lane: number;
};

type ClipboardEntry = {
  itemId: string;
  track: TimelineTrackKind;
  sourceStart: number;
  duration: number;
  linkedAudio: ClipboardAudio[];
};

type UseTimelineClipboardParams = {
  commitTimelineSegments: (updater: (segments: TimelineSegment[]) => TimelineSegment[]) => void;
  currentTimeRef: MutableRefObject<number>;
  deleteTimelineSegment: (segmentId: string | null) => void;
  knownTimelineItemIdsRef: MutableRefObject<Set<string>>;
  mediaById: Map<string, EditorMediaItem>;
  selectedTimelineSegmentId: string | null;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedTimelineSegmentIds?: Dispatch<SetStateAction<string[]>>;
  timelineRenderDuration: number;
  timelineSegments: TimelineSegment[];
};

export function useTimelineClipboard(params: UseTimelineClipboardParams) {
  const {
    commitTimelineSegments,
    currentTimeRef,
    deleteTimelineSegment,
    knownTimelineItemIdsRef,
    mediaById,
    selectedTimelineSegmentId,
    setExportMessage,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    setSelectedTimelineSegmentIds,
    timelineRenderDuration,
    timelineSegments
  } = params;

  const timelineClipboardRef = useRef<ClipboardEntry | null>(null);

  function copySelectedTimelineSegment(): string | null {
    const segment = timelineSegments.find((item) => item.id === selectedTimelineSegmentId);
    if (!segment) {
      return null;
    }

    timelineClipboardRef.current = {
      itemId: segment.itemId,
      track: segment.track,
      sourceStart: segment.sourceStart,
      duration: Math.max(0.1, segment.end - segment.start),
      linkedAudio: getLinkedRecordingAudioIds(timelineSegments, segment.id).flatMap((id) => {
        const audio = timelineSegments.find((item) => item.id === id);
        if (!audio) return [];
        // Only the part of the audio that plays under this clip.
        const start = Math.max(segment.start, audio.start);
        const end = Math.min(segment.end, audio.end);
        return end - start > 0
          ? [{
              itemId: audio.itemId,
              sourceStart: audio.sourceStart + (start - audio.start),
              duration: end - start,
              offset: start - segment.start,
              lane: audio.lane
            }]
          : [];
      })
    };
    setExportMessage("Clip copied");
    return segment.id;
  }

  function cutSelectedTimelineSegment() {
    const copiedSegmentId = copySelectedTimelineSegment();
    if (copiedSegmentId) {
      // The clipboard stores one clip, so Cut must remove only that copied
      // primary clip even when the UI currently has a larger range selected.
      deleteTimelineSegment(copiedSegmentId);
    }
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
      const placed = moveTimelineSegment([...segments, draft], segmentId, start, timelineRenderDuration);
      const pastedStart = placed.find((segment) => segment.id === segmentId)?.start ?? start;
      const linkedAudio = clip.linkedAudio
        .filter((audio) => mediaById.has(audio.itemId))
        .map((audio): TimelineSegment => ({
          id: `${audio.itemId}:segment-${createId("paste")}`,
          itemId: audio.itemId,
          track: "audio",
          lane: audio.lane,
          start: pastedStart + audio.offset,
          end: pastedStart + audio.offset + audio.duration,
          sourceStart: audio.sourceStart
        }));
      return linkedAudio.length > 0 ? normalizeAudioLanes([...placed, ...linkedAudio]) : placed;
    });
    setSelectedItemId(clip.itemId);
    setSelectedTimelineSegmentId(segmentId);
    setSelectedTimelineSegmentIds?.([segmentId]);
    setExportMessage("Clip pasted");
  }

  return {
    copySelectedTimelineSegment,
    cutSelectedTimelineSegment,
    pasteTimelineSegment
  };
}
