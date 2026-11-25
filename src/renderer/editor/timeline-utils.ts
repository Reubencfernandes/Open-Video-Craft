/**
 * Pure timeline math: syncing segments with the media library, move/trim with
 * snapping and non-overlap, split checks, audio lane assignment, clip style
 * and duration calculations.
 */
import type { CSSProperties } from "react";
import type {
  EditorMediaItem,
  LayoutMode,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineContextMenu,
  TimelineLaneId,
  TimelineMediaClip,
  TimelineRangeSelection,
  TimelineSegment,
  TimelineTrackKind,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";
import { clampNumber } from "./utils";

export function getTimelineMediaDuration(
  item: EditorMediaItem,
  activeDuration: number,
  selectedItemId: string | null
): number {
  if (item.duration && item.duration > 0) {
    return item.duration;
  }

  if (item.origin === "project" && item.id === selectedItemId && activeDuration > 0) {
    return activeDuration;
  }

  if (item.kind === "image") {
    return 5;
  }

  return 0;
}

export function getTimelineTrackKind(item: EditorMediaItem): TimelineTrackKind {
  return item.kind === "audio" ? "audio" : "video";
}

/**
 * How much longer than its media a clip may be because of speed effects: a 0.5x
 * region occupies twice the source length.
 */
export function speedStretchFor(
  segment: Pick<TimelineSegment, "start" | "end">,
  speedEffects: readonly SpeedEffect[]
): number {
  let stretch = 1;
  for (const effect of speedEffects) {
    if (effect.rate <= 0) continue;
    if (effect.start < segment.end && effect.end > segment.start) {
      stretch = Math.max(stretch, 1 / effect.rate);
    }
  }
  return stretch;
}

export function syncTimelineSegments(
  currentSegments: TimelineSegment[],
  items: EditorMediaItem[],
  mediaDurationById: Map<string, number>,
  newItemIds: ReadonlySet<string>,
  speedEffects: readonly SpeedEffect[] = []
): TimelineSegment[] {
  const itemIds = new Set(items.map((item) => item.id));
  const retainedSegments = currentSegments.filter((segment) => itemIds.has(segment.itemId));
  const nextSegments = retainedSegments
    .map((segment) => {
      const itemDuration = mediaDurationById.get(segment.itemId);
      const track = segment.track;
      const lane = normalizeTimelineLane(segment.lane);
      // Unknown metadata must never collapse a saved trim or source offset.
      if (!itemDuration || !Number.isFinite(itemDuration) || itemDuration <= 0) {
        return { ...segment, lane };
      }
      const sourceStart = clampNumber(segment.sourceStart, 0, Math.max(0, itemDuration - 0.01));
      // A clip's timeline length can never exceed the media left after sourceStart,
      // but its end lives in timeline space and may sit well past itemDuration once
      // the clip has been moved, so clamp against start + remaining source, not
      // against the raw media duration.
      const maxEnd = segment.start +
        Math.max(0.01, itemDuration - sourceStart) * speedStretchFor(segment, speedEffects);
      const end = segment.pendingDuration
        ? maxEnd
        : clampNumber(segment.end, segment.start + 0.01, maxEnd);

      return {
        ...segment,
        ...(segment.pendingDuration ? { pendingDuration: false } : {}),
        track,
        lane,
        end,
        sourceStart
      };
    });

  for (const item of items) {
    if (!newItemIds.has(item.id) || nextSegments.some((segment) => segment.itemId === item.id)) {
      continue;
    }

    const track = getTimelineTrackKind(item);
    const channel = track === "video" ? item.channel : undefined;
    // Video clips stay sequenced on the video track. Audio clips start at the
    // beginning and are assigned to the first channel that keeps them visible
    // without overlapping another clip on that channel.
    const trackEnd = nextSegments
      .filter((segment) => segment.track === track)
      .reduce((max, segment) => Math.max(max, segment.end), 0);
    const knownDuration = mediaDurationById.get(item.id);
    const pendingDuration = !knownDuration || !Number.isFinite(knownDuration) || knownDuration <= 0;
    const itemDuration = pendingDuration ? 1 : knownDuration;
    const segmentId = `${item.id}:segment-0`;
    const start = track === "audio" || channel !== undefined ? 0 : trackEnd;
    const end = start + itemDuration;
    const lane = track === "audio"
      ? resolveAudioLane(nextSegments, segmentId, start, end, 0)
      : channel === undefined ? 0 : normalizeTimelineLane(channel);

    nextSegments.push({
      id: segmentId,
      itemId: item.id,
      track,
      lane,
      start,
      end,
      sourceStart: 0,
      ...(pendingDuration ? { pendingDuration: true } : {})
    });
  }

  const normalizedSegments = normalizeAudioLanes(nextSegments);
  return areTimelineSegmentsEqual(currentSegments, normalizedSegments)
    ? currentSegments
    : normalizedSegments;
}

export function createTimelineMediaClips(
  segments: TimelineSegment[],
  mediaById: Map<string, EditorMediaItem>
): TimelineMediaClip[] {
  return segments
    .map((segment) => {
      const item = mediaById.get(segment.itemId);
      if (!item) {
        return null;
      }

      return {
        id: segment.id,
        item,
        track: segment.track,
        lane: normalizeTimelineLane(segment.lane),
        start: segment.start,
        duration: Math.max(0.01, segment.end - segment.start),
        sourceStart: segment.sourceStart,
        ...(segment.hidden === true ? { hidden: true } : {}),
        ...(segment.layout === undefined ? {} : { layout: segment.layout }),
        ...(segment.cameraStyle === undefined ? {} : { cameraStyle: segment.cameraStyle })
      } satisfies TimelineMediaClip;
    })
    .filter((clip): clip is NonNullable<typeof clip> => clip !== null)
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id));
}

export function findTimelineSegmentAtTime(
  segments: TimelineSegment[],
  time: number
): TimelineSegment | null {
  return (
    segments.find((segment) => time > segment.start && time < segment.end) ??
    segments.find((segment) => time >= segment.start && time <= segment.end) ??
    null
  );
}

/** Semantic lane occupied by a media segment. */
export function getTimelineSegmentLaneId(segment: TimelineSegment): TimelineLaneId {
  return segment.track === "video"
    ? getVideoTimelineLaneId(segment.lane)
    : `audio:${normalizeTimelineLane(segment.lane)}`;
}

/** Timeline row id for a video channel; channel 0 keeps the legacy "video" id. */
export function getVideoTimelineLaneId(lane: number): TimelineLaneId {
  const normalized = normalizeTimelineLane(lane);
  return normalized === 0 ? "video" : `video:${normalized}`;
}

/** Ordered, inclusive lane span between the two ends of a marquee gesture. */
export function getTimelineLaneIdsBetween(
  orderedLaneIds: readonly TimelineLaneId[],
  anchorLaneId: TimelineLaneId,
  currentLaneId: TimelineLaneId
): TimelineLaneId[] {
  const anchorIndex = orderedLaneIds.indexOf(anchorLaneId);
  const currentIndex = orderedLaneIds.indexOf(currentLaneId);
  if (anchorIndex < 0 || currentIndex < 0) {
    return [];
  }

  const start = Math.min(anchorIndex, currentIndex);
  const end = Math.max(anchorIndex, currentIndex);
  return orderedLaneIds.slice(start, end + 1);
}

/** Media clips touched by both the time and lane bounds of a marquee gesture. */
export function getTimelineSegmentIdsInRange(
  segments: TimelineSegment[],
  start: number,
  end: number,
  laneIds: readonly TimelineLaneId[]
): string[] {
  const low = Math.max(0, Math.min(start, end));
  const high = Math.max(low, Math.max(start, end));
  if (high - low < 1e-6) {
    return [];
  }

  const selectedLanes = new Set(laneIds);
  return segments
    .filter(
      (segment) =>
        selectedLanes.has(getTimelineSegmentLaneId(segment)) &&
        segment.end > low &&
        segment.start < high
    )
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id))
    .map((segment) => segment.id);
}

/** True when a timed item is touched by both bounds of a marquee. */
export function isTimelineTimedItemInRange(
  selection: { start: number; end: number; laneIds: readonly TimelineLaneId[] } | null,
  laneId: TimelineLaneId,
  itemStart: number,
  itemEnd: number
): boolean {
  if (!selection || !selection.laneIds.includes(laneId)) {
    return false;
  }

  const low = Math.max(0, Math.min(selection.start, selection.end));
  const high = Math.max(low, Math.max(selection.start, selection.end));
  return high - low >= 1e-6 && itemEnd > low && itemStart < high;
}

/**
 * Rebuild a marquee from the clips it actually owns after move/reflow. This
 * intentionally drops intervening paint-only rows and follows lane changes.
 */
export function getTimelineRangeSelectionForSegments(
  segments: TimelineSegment[],
  segmentIds: readonly string[]
): TimelineRangeSelection | null {
  const selectedIds = new Set(segmentIds);
  const selected = segments.filter((segment) => selectedIds.has(segment.id));
  if (selected.length === 0) {
    return null;
  }

  const laneIds = [...new Set(selected.map(getTimelineSegmentLaneId))].sort(
    (first, second) => getTimelineLaneSortOrder(first) - getTimelineLaneSortOrder(second)
  );
  return {
    start: Math.min(...selected.map((segment) => segment.start)),
    end: Math.max(...selected.map((segment) => segment.end)),
    laneIds
  };
}

function getTimelineLaneSortOrder(laneId: TimelineLaneId): number {
  if (laneId === "video") return -1;
  if (laneId.startsWith("audio:")) {
    return Number(laneId.slice("audio:".length));
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Shortest piece a blade may leave on either side of a cut. 10ms matches the
 * linked-audio minimum, so picture and voice agree on what a sliver is and a
 * split 50ms from a clip edge lands where the owner pointed.
 */
export const timelineSplitEpsilonSeconds = 0.01;

export function canSplitTimelineSegment(segment: TimelineSegment, time: number): boolean {
  return (
    time > segment.start + timelineSplitEpsilonSeconds &&
    time < segment.end - timelineSplitEpsilonSeconds
  );
}

export function canSplitTimelineSegmentAt(
  segments: TimelineSegment[],
  contextMenu: Exclude<TimelineContextMenu, null>
): boolean {
  const segment =
    (contextMenu.segmentId
      ? segments.find((item) => item.id === contextMenu.segmentId)
      : null) ?? findTimelineSegmentAtTime(segments, contextMenu.time);
  return segment ? canSplitTimelineSegment(segment, contextMenu.time) : false;
}

/**
 * The clips a context-menu "split" cuts when the menu was opened on one clip of a multi-selection: every selected clip
 * that can be split at the menu time. Returns null when the menu is not on a multi-selection (a single clip, a clip outside
 * the selection, empty space), so the caller cuts the clicked clip as before.
 */
export function getContextMenuSplitSelectionIds(
  segments: TimelineSegment[],
  selectedSegmentIds: readonly string[],
  contextMenu: Exclude<TimelineContextMenu, null>
): string[] | null {
  if (
    !contextMenu.segmentId ||
    selectedSegmentIds.length < 2 ||
    !selectedSegmentIds.includes(contextMenu.segmentId)
  ) {
    return null;
  }
  const selected = new Set(selectedSegmentIds);
  return segments
    .filter((segment) => selected.has(segment.id) && canSplitTimelineSegment(segment, contextMenu.time))
    .map((segment) => segment.id);
}

/**
 * Resolve the clip to split at a playhead time. A stale selection must not
 * block splitting a different clip under the playhead.
 */
export function findSplittableTimelineSegment(
  segments: TimelineSegment[],
  selectedSegmentId: string | null,
  time: number
): TimelineSegment | null {
  const selected = selectedSegmentId
    ? segments.find((segment) => segment.id === selectedSegmentId) ?? null
    : null;
  if (selected && canSplitTimelineSegment(selected, time)) return selected;
  // A video editor's split command should blade the picture track before an
  // overlapping music/voice clip when there is no valid selected clip.
  const underPlayhead =
    segments.find(
      (segment) =>
        segment.track === "video" &&
        time >= segment.start &&
        time <= segment.end
    ) ?? findTimelineSegmentAtTime(segments, time);
  return underPlayhead && canSplitTimelineSegment(underPlayhead, time) ? underPlayhead : null;
}

/**
 * Whether the playhead split has anything to cut: any selected clip for a
 * multi-selection, otherwise the single selected clip or the clip under the
 * playhead — the same targets the split action itself resolves.
 */
export function canSplitTimelineSelectionAt(
  segments: TimelineSegment[],
  selectedSegmentIds: readonly string[],
  selectedSegmentId: string | null,
  time: number
): boolean {
  if (selectedSegmentIds.length > 1) {
    return segments.some(
      (segment) =>
        selectedSegmentIds.includes(segment.id) && canSplitTimelineSegment(segment, time)
    );
  }
  return findSplittableTimelineSegment(segments, selectedSegmentId, time) !== null;
}

export function trimTimelineSegment(
  segments: TimelineSegment[],
  segmentId: string,
  edge: TimelineTrimEdge,
  time: number,
  mediaDurationById: Map<string, number>
): TimelineSegment[] {
  const nextSegments = segments.map((segment) => {
    if (segment.id !== segmentId) {
      return segment;
    }

    const knownDuration = mediaDurationById.get(segment.itemId);
    const mediaDuration = knownDuration && knownDuration > 0
      ? knownDuration
      : segment.sourceStart + segment.end - segment.start;
    const minDuration = 0.01;
    // The video track is a single lane: a trim stops against its neighbors
    // instead of sliding underneath them.
    const neighbors = segment.track === "video"
      ? getVideoNeighborBounds(segments, segment)
      : { previousEnd: 0, nextStart: Number.POSITIVE_INFINITY };

    if (edge === "start") {
      // A clip already shorter than the minimum may grow but never shrink.
      const earliestStart = Math.min(
        Math.max(0, segment.start - segment.sourceStart, neighbors.previousEnd),
        segment.start
      );
      const latestStart = Math.max(segment.end - minDuration, segment.start);
      const nextStart = clampNumber(time, earliestStart, latestStart);
      const sourceStart = clampNumber(
        segment.sourceStart + (nextStart - segment.start),
        0,
        Math.max(0, mediaDuration - minDuration)
      );
      return {
        ...segment,
        ...(segment.pendingDuration ? { pendingDuration: false } : {}),
        start: nextStart,
        sourceStart
      };
    }

    const earliestEnd = Math.min(segment.start + minDuration, segment.end);
    const latestEnd = Math.max(
      Math.min(
        segment.start + Math.max(minDuration, mediaDuration - segment.sourceStart),
        neighbors.nextStart
      ),
      earliestEnd
    );
    return {
      ...segment,
      ...(segment.pendingDuration ? { pendingDuration: false } : {}),
      end: clampNumber(time, earliestEnd, latestEnd)
    };
  });

  return resolveSegmentAudioLane(nextSegments, segmentId);
}

/** Closest video edges on either side of a clip, ignoring legacy overlaps. */
function getVideoNeighborBounds(
  segments: TimelineSegment[],
  segment: TimelineSegment
): { previousEnd: number; nextStart: number } {
  let previousEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const other of segments) {
    if (other.id === segment.id || other.track !== "video") continue;
    if (other.end <= segment.start + 0.01) previousEnd = Math.max(previousEnd, other.end);
    if (other.start >= segment.end - 0.01) nextStart = Math.min(nextStart, other.start);
  }
  return { previousEnd, nextStart };
}

export function moveTimelineSegment(
  segments: TimelineSegment[],
  segmentId: string,
  rawStart: number,
  timelineDuration: number,
  extraSnapTargets: number[] = [],
  targetLane?: number
): TimelineSegment[] {
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment) {
    return segments;
  }

  const length = segment.end - segment.start;
  const laneHint = targetLane === undefined ? segment.lane : Math.max(0, Math.trunc(targetLane));
  const snapThreshold = getDefaultSnapThreshold(timelineDuration);
  const snapTargets = [0, ...extraSnapTargets];
  for (const other of segments) {
    if (other.id === segmentId || other.track !== segment.track) {
      continue;
    }
    snapTargets.push(other.start, other.end);
  }

  let start = Math.max(0, rawStart);
  for (const target of snapTargets) {
    if (Math.abs(start - target) <= snapThreshold) {
      start = target;
      break;
    }
  }
  const end = start + length;
  for (const target of snapTargets) {
    if (Math.abs(end - target) <= snapThreshold) {
      start = Math.max(0, target - length);
      break;
    }
  }

  if (segment.track === "video") {
    const clampedStart = clampStartIntoFreeVideoGap(
      segments,
      segmentId,
      start,
      length,
      laneHint
    );
    if (clampedStart === null) {
      return segments;
    }
    start = clampedStart;
  }

  const nextStart = Math.max(0, start);
  const nextEnd = nextStart + length;
  const nextLane =
    segment.track === "audio"
      ? resolveAudioLane(segments, segmentId, nextStart, nextEnd, laneHint)
      : laneHint;

  return segments.map((item) =>
    item.id === segmentId
      ? { ...item, lane: nextLane, start: nextStart, end: nextEnd }
      : item
  );
}

/** Resolve the real start for a newly inserted clip before it is committed. */
export function getSnappedInsertStart(
  segments: readonly TimelineSegment[],
  track: TimelineTrackKind,
  rawStart: number,
  length: number,
  timelineDuration: number
): number {
  const draft: TimelineSegment = {
    id: "__insert-preview__",
    itemId: "__insert-preview__",
    track,
    lane: 0,
    start: Math.max(0, rawStart),
    end: Math.max(0, rawStart) + Math.max(0.01, length),
    sourceStart: 0
  };
  const moved = moveTimelineSegment(
    [...segments, draft], draft.id, draft.start, timelineDuration
  ).find((segment) => segment.id === draft.id);
  return moved?.start ?? draft.start;
}

/**
 * Move a media-clip selection as one rigid group. The shared delta preserves
 * spacing and source offsets, snaps any selected edge to nearby cuts/playhead,
 * and prevents selected video clips from overlapping unselected video clips.
 */
export function moveTimelineSegmentGroup(
  segments: TimelineSegment[],
  segmentIds: readonly string[],
  rawDelta: number,
  timelineDuration: number,
  extraSnapTargets: number[] = [],
  snapThresholdSeconds?: number,
  laneDelta = 0
): TimelineSegment[] {
  const selectedIds = new Set(segmentIds);
  const selected = segments.filter((segment) => selectedIds.has(segment.id));
  if (selected.length === 0) {
    return segments;
  }

  const minimumStart = selected.reduce((min, segment) => Math.min(min, segment.start), Infinity);
  let delta = Math.max(-minimumStart, rawDelta);
  const snapThreshold = snapThresholdSeconds ?? getDefaultSnapThreshold(timelineDuration);
  const targets = [
    0,
    ...extraSnapTargets,
    ...segments
      .filter((segment) => !selectedIds.has(segment.id))
      .flatMap((segment) => [segment.start, segment.end])
  ];

  let closestAdjustment = Number.POSITIVE_INFINITY;
  for (const segment of selected) {
    for (const edge of [segment.start, segment.end]) {
      for (const target of targets) {
        const adjustment = target - (edge + delta);
        // Snapping may refine a drag, never undo it: a candidate that puts the
        // group back where it started reads as "nothing moves".
        if (Math.abs(delta) > 0 && Math.abs(delta + adjustment) < 1e-9) {
          continue;
        }
        if (
          Math.abs(adjustment) <= snapThreshold &&
          Math.abs(adjustment) < Math.abs(closestAdjustment)
        ) {
          closestAdjustment = adjustment;
        }
      }
    }
  }
  if (Number.isFinite(closestAdjustment)) {
    delta = Math.max(-minimumStart, delta + closestAdjustment);
  }

  // Dropping on another channel changes the target lane; only clips that end up
  // on the same channel can conflict, other channels overlap by design.
  const targetLaneFor = (segment: TimelineSegment): number =>
    segment.track === "video" ? Math.max(0, segment.lane + laneDelta) : segment.lane;
  const selectedVideo = selected.filter((segment) => segment.track === "video");
  const laneBySegmentId = new Map(selected.map((segment) => [segment.id, targetLaneFor(segment)]));
  const otherVideo = segments.filter(
    (segment) => segment.track === "video" && !selectedIds.has(segment.id)
  );
  const isValidVideoDelta = (candidate: number) =>
    selectedVideo.every((moving) =>
      otherVideo.every(
        (other) =>
          other.lane !== laneBySegmentId.get(moving.id) ||
          !rangesOverlap(
            moving.start + candidate,
            moving.end + candidate,
            other.start,
            other.end
          )
      )
    );

  if (!isValidVideoDelta(delta)) {
    const candidates = [
      -minimumStart,
      ...selectedVideo.flatMap((moving) =>
        otherVideo.flatMap((other) => [
          other.start - moving.end,
          other.end - moving.start
        ])
      )
    ]
      .filter((candidate) => candidate >= -minimumStart && isValidVideoDelta(candidate))
      .sort((first, second) => Math.abs(first - delta) - Math.abs(second - delta));

    if (candidates.length === 0) {
      return segments;
    }
    delta = candidates[0];
  }

  const moved = segments.map((segment) =>
    selectedIds.has(segment.id)
      ? {
          ...segment,
          start: segment.start + delta,
          end: segment.end + delta,
          lane: targetLaneFor(segment)
        }
      : segment
  );
  return normalizeAudioLanes(moved);
}

/**
 * Swaps two adjacent video channels. Unlike a move, a swap never changes clip
 * timing, metadata or selection: every video segment in both lanes exchanges
 * only its lane number.
 */
export function swapTimelineVideoChannels(
  segments: readonly TimelineSegment[],
  firstLane: number,
  secondLane: number
): TimelineSegment[] {
  if (
    !Number.isInteger(firstLane) ||
    !Number.isInteger(secondLane) ||
    firstLane < 0 ||
    secondLane < 0 ||
    Math.abs(firstLane - secondLane) !== 1
  ) {
    return [...segments];
  }
  return segments.map((segment) => {
    if (segment.track !== "video") return segment;
    const lane = normalizeTimelineLane(segment.lane);
    if (lane === firstLane) return { ...segment, lane: secondLane };
    if (lane === secondLane) return { ...segment, lane: firstLane };
    return segment;
  });
}

function getDefaultSnapThreshold(timelineDuration: number): number {
  return Math.max(0.08, timelineDuration * 0.01);
}

/** Pull a time onto the closest target within `threshold`, if any. */
export function snapTimelineTime(
  time: number,
  targets: readonly number[],
  threshold: number
): number {
  let best = time;
  let bestDistance = threshold;
  for (const target of targets) {
    const distance = Math.abs(target - time);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

// Video clips live on a single lane, so a drag must never create an overlap:
// the clip stops against its neighbor and only jumps to the next gap once the
// pointer is closer to a position inside that gap (audio resolves overlaps by
// moving to another lane instead).
function clampStartIntoFreeVideoGap(
  segments: TimelineSegment[],
  segmentId: string,
  start: number,
  length: number,
  lane = 0
): number | null {
  const others = segments
    .filter((item) => item.id !== segmentId && item.track === "video" && item.lane === lane)
    .sort((first, second) => first.start - second.start);

  const gaps: Array<[number, number]> = [];
  let low = 0;
  for (const other of others) {
    if (other.start > low) {
      gaps.push([low, other.start]);
    }
    low = Math.max(low, other.end);
  }
  gaps.push([low, Number.POSITIVE_INFINITY]);

  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [gapStart, gapEnd] of gaps) {
    if (gapEnd - gapStart < length - 1e-6) {
      continue;
    }

    const clamped = Math.min(Math.max(start, gapStart), gapEnd - length);
    const distance = Math.abs(clamped - start);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = clamped;
    }
  }

  return best;
}

export function createAudioTimelineTracks(
  clips: TimelineMediaClip[]
): Array<{ lane: number; clips: TimelineMediaClip[] }> {
  const lanes = new Map<number, TimelineMediaClip[]>();

  for (const clip of clips) {
    const lane = normalizeTimelineLane(clip.lane);
    lanes.set(lane, [...(lanes.get(lane) ?? []), clip]);
  }

  return [...lanes.entries()]
    .sort(([firstLane], [secondLane]) => firstLane - secondLane)
    .map(([lane, laneClips]) => ({
      lane,
      clips: laneClips.sort(
        (first, second) => first.start - second.start || first.id.localeCompare(second.id)
      )
    }));
}

export function normalizeAudioLanes(segments: TimelineSegment[]): TimelineSegment[] {
  const normalized = segments.map((segment) => ({
    ...segment,
    // Every track keeps its authored channel so video channels survive a rebuild.
    lane: normalizeTimelineLane(segment.lane)
  }));
  const processedAudioSegments: TimelineSegment[] = [];
  const laneById = new Map<string, number>();

  for (const segment of normalized
    .filter((item) => item.track === "audio")
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id))) {
    const lane = resolveAudioLane(processedAudioSegments, segment.id, segment.start, segment.end, segment.lane);

    laneById.set(segment.id, lane);
    processedAudioSegments.push({ ...segment, lane });
  }

  return normalized.map((segment) =>
    segment.track === "audio" ? { ...segment, lane: laneById.get(segment.id) ?? 0 } : segment
  );
}

function resolveSegmentAudioLane(
  segments: TimelineSegment[],
  segmentId: string
): TimelineSegment[] {
  const segment = segments.find((item) => item.id === segmentId);
  if (!segment || segment.track !== "audio") {
    return segments;
  }

  const lane = resolveAudioLane(segments, segmentId, segment.start, segment.end, segment.lane);
  return segments.map((item) => (item.id === segmentId ? { ...item, lane } : item));
}

export function resolveAudioLane(
  segments: TimelineSegment[],
  segmentId: string,
  start: number,
  end: number,
  preferredLane: number
): number {
  const occupied = new Set(segments.filter((segment) =>
    segment.id !== segmentId && segment.track === "audio" &&
    rangesOverlap(start, end, segment.start, segment.end)
  ).map((segment) => normalizeTimelineLane(segment.lane)));
  const preferred = normalizeTimelineLane(preferredLane);
  if (!occupied.has(preferred)) return preferred;
  // Scan occupied lanes, never allocate an array sized by persisted lane IDs.
  let lane = 0;
  while (occupied.has(lane)) lane += 1;
  return lane;
}

function audioLaneHasOverlap(
  segments: TimelineSegment[],
  segmentId: string,
  lane: number,
  start: number,
  end: number
): boolean {
  return segments.some(
    (segment) =>
      segment.id !== segmentId &&
      segment.track === "audio" &&
      normalizeTimelineLane(segment.lane) === lane &&
      rangesOverlap(start, end, segment.start, segment.end)
  );
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  const tolerance = 0.01;
  return firstStart < secondEnd - tolerance && firstEnd > secondStart + tolerance;
}

export function normalizeTimelineLane(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function areTimelineSegmentsEqual(
  first: TimelineSegment[],
  second: TimelineSegment[]
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function createTimelineClipStyle(
  start: number,
  duration: number,
  timelineDuration: number
): CSSProperties {
  const safeDuration = Math.max(timelineDuration, start + duration, 1);
  const left = Math.min(100, Math.max(0, (start / safeDuration) * 100));
  const width = Math.min(100 - left, Math.max(0, (duration / safeDuration) * 100));
  const widthPercent = Number(width.toFixed(4));

  return {
    left: `${left}%`,
    right: "auto",
    width: `${widthPercent}%`,
    minWidth: "2px"
  };
}

export function calculateTimelineDuration(
  videoClips: TimelineMediaClip[],
  audioClips: TimelineMediaClip[],
  zoomEffects: ZoomEffect[],
  speedEffects: SpeedEffect[],
  subtitles: SubtitleSegment[],
  activeDuration: number,
  textOverlays: TextOverlay[] = []
): number {
  const videoEnd = Math.max(0, ...videoClips.map((clip) => clip.start + clip.duration));
  const secondaryContentEnd = Math.max(
    0,
    ...audioClips.map((clip) => clip.start + clip.duration),
    ...zoomEffects.map((effect) => effect.end),
    ...speedEffects.map((effect) => effect.end),
    ...subtitles.map((subtitle) => subtitle.end),
    ...textOverlays.map((overlay) => overlay.end)
  );
  // A video composition ends with its last video frame. Imported music,
  // subtitles, or effects can otherwise leave an invisible tail after the
  // user trims the picture. Audio-only projects still use all timed content.
  const timelineContentEnd = videoClips.length > 0 ? videoEnd : secondaryContentEnd;

  return Math.max(timelineContentEnd, timelineContentEnd > 0 ? 0 : activeDuration, 1);
}

export function createClipPlaybackKey(clip: TimelineMediaClip): string {
  return [
    clip.id,
    clip.item.url,
    clip.start.toFixed(4),
    clip.duration.toFixed(4),
    clip.sourceStart.toFixed(4)
  ].join("|");
}


/** Layout in force at a moment: a clip may impose its own. */
export function resolveClipLayout(
  clipLayout: LayoutMode | undefined,
  projectLayout: LayoutMode
): LayoutMode {
  return clipLayout ?? projectLayout;
}

/**
 * Start of the earliest clip being packed. A selection compacts in place while
 * the whole lane compacts to zero and loses its leading gap.
 */
export function getTimelinePackAnchor(
  segments: readonly TimelineSegment[],
  ids: readonly string[]
): number {
  const targets = new Set(ids);
  const starts = segments
    .filter((segment) => targets.has(segment.id))
    .map((segment) => segment.start);
  return starts.length > 0 ? Math.min(...starts) : 0;
}

/**
 * Packs the given clips back to back from \`anchor\`, removing empty space.
 * Untouched clips, including every audio channel, keep their position.
 */
export function packTimelineSegments(
  segments: readonly TimelineSegment[],
  ids: readonly string[],
  anchor = 0
): TimelineSegment[] {
  const targets = new Set(ids);
  const ordered = segments
    .filter((segment) => targets.has(segment.id))
    .sort((first, second) => first.start - second.start || first.id.localeCompare(second.id));
  if (ordered.length === 0) return [...segments];

  const placed = new Map<string, { start: number; end: number }>();
  let cursor = Math.max(0, anchor);
  for (const segment of ordered) {
    const length = Math.max(0.01, segment.end - segment.start);
    placed.set(segment.id, { start: cursor, end: cursor + length });
    cursor += length;
  }
  return segments.map((segment) => {
    const target = placed.get(segment.id);
    return target ? { ...segment, start: target.start, end: target.end } : segment;
  });
}

/** Cut points of the timeline: every clip boundary the cursor can lock onto. */
export function timelineCutTimes(segments: readonly TimelineSegment[]): number[] {
  const times = new Set<number>();
  for (const segment of segments) {
    times.add(Math.round(segment.start * 1000) / 1000);
    times.add(Math.round(segment.end * 1000) / 1000);
  }
  return [...times].sort((first, second) => first - second);
}

/** Pulls the playhead onto a nearby cut. */
export function snapTimeToCuts(
  time: number,
  cuts: readonly number[],
  thresholdSeconds = 0.12
): { time: number; snappedTo: number | null } {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cut of cuts) {
    const distance = Math.abs(cut - time);
    if (distance <= thresholdSeconds && distance < bestDistance) {
      best = cut;
      bestDistance = distance;
    }
  }
  return best === null ? { time, snappedTo: null } : { time: best, snappedTo: best };
}
