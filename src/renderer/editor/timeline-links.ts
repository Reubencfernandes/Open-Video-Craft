/**
 * Linked recording audio.
 *
 * A screen recording is stored as separate files: the screen video (played
 * muted) plus mic and system audio. The timeline keeps each file as its own
 * segment, so every picture edit — split, delete, move, trim, cut/paste — must
 * carry the audio that plays under that picture, or the voice drifts away from
 * the video.
 *
 * Links are derived instead of stored: an audio segment is linked to a video
 * segment when both come from the same recording, they still share the same
 * source-to-timeline offset, and their time ranges overlap. Moving the audio
 * on its own changes that offset, which is how a user deliberately unlinks it,
 * and projects saved before this existed need no migration.
 */
import { trimTimelineSegment } from "./timeline-utils";
import type { TimelineSegment, TimelineTrimEdge } from "./types";

const recordingVideoSuffix = ":screen";
const recordingAudioSuffixes = [":audio", ":system-audio"];
const syncToleranceSeconds = 0.001;
/** Linked pieces thinner than this are treated as already aligned. */
export const minimumLinkedPieceSeconds = 0.05;

type SegmentIdFactory = (sourceId: string) => string;

/** The recording a project media item belongs to, or null for imports. */
export function getRecordingGroupId(itemId: string): string | null {
  const suffix = [recordingVideoSuffix, ...recordingAudioSuffixes].find((candidate) =>
    itemId.endsWith(candidate)
  );
  return suffix ? itemId.slice(0, -suffix.length) || null : null;
}

export function isLinkedRecordingAudio(
  video: TimelineSegment,
  audio: TimelineSegment
): boolean {
  if (
    video.track !== "video" ||
    audio.track !== "audio" ||
    !video.itemId.endsWith(recordingVideoSuffix) ||
    !recordingAudioSuffixes.some((suffix) => audio.itemId.endsWith(suffix))
  ) {
    return false;
  }

  const group = getRecordingGroupId(video.itemId);
  return (
    group !== null &&
    getRecordingGroupId(audio.itemId) === group &&
    Math.abs(getSyncOffset(video) - getSyncOffset(audio)) <= syncToleranceSeconds &&
    audio.start < video.end - minimumLinkedPieceSeconds &&
    audio.end > video.start + minimumLinkedPieceSeconds
  );
}

/** Audio segments that play under a recording's video segment. */
export function getLinkedRecordingAudioIds(
  segments: readonly TimelineSegment[],
  videoSegmentId: string
): string[] {
  const video = segments.find((segment) => segment.id === videoSegmentId);
  if (!video || video.track !== "video") {
    return [];
  }
  return segments
    .filter((segment) => isLinkedRecordingAudio(video, segment))
    .map((segment) => segment.id);
}

/** Linked audio for a whole selection, excluding anything already selected. */
export function getLinkedRecordingAudioIdsForSelection(
  segments: readonly TimelineSegment[],
  selectedSegmentIds: readonly string[]
): string[] {
  const selected = new Set(selectedSegmentIds);
  const linked = new Set<string>();
  for (const id of selectedSegmentIds) {
    for (const audioId of getLinkedRecordingAudioIds(segments, id)) {
      if (!selected.has(audioId)) linked.add(audioId);
    }
  }
  return [...linked];
}

/** True when a recording audio segment currently follows some video segment. */
export function isRecordingAudioLinked(
  segments: readonly TimelineSegment[],
  audio: TimelineSegment
): boolean {
  return segments.some((segment) => isLinkedRecordingAudio(segment, audio));
}

/**
 * Split linked audio at the edges of each video segment so the audio under a
 * clip becomes its own piece. Returns those pieces' ids. Splitting never
 * changes what is heard: both halves keep the original sync offset.
 *
 * Audio listed in `excludeIds` is left whole because the caller acts on it as
 * an explicitly selected clip.
 */
export function isolateLinkedRecordingAudio(
  segments: readonly TimelineSegment[],
  videoSegmentIds: readonly string[],
  createSegmentId: SegmentIdFactory,
  excludeIds: ReadonlySet<string> = new Set()
): { segments: TimelineSegment[]; linkedIds: string[] } {
  let next = [...segments];
  const linkedIds = new Set<string>();

  for (const videoId of videoSegmentIds) {
    const video = next.find((segment) => segment.id === videoId);
    if (!video || video.track !== "video") continue;

    const linkedAudio = next.filter(
      (segment) => !excludeIds.has(segment.id) && isLinkedRecordingAudio(video, segment)
    );
    for (const audio of linkedAudio) {
      let pieceId = audio.id;
      const atStart = cutTimelineSegmentAt(next, pieceId, video.start, createSegmentId);
      if (atStart) {
        next = atStart.segments;
        pieceId = atStart.rightId;
      }
      const atEnd = cutTimelineSegmentAt(next, pieceId, video.end, createSegmentId);
      if (atEnd) {
        next = atEnd.segments;
      }
      linkedIds.add(pieceId);
    }
  }

  return { segments: next, linkedIds: [...linkedIds] };
}

/**
 * Split every linked audio segment that crosses `time`, so a blade through a
 * recording's picture also cuts its voice.
 */
export function splitLinkedRecordingAudioAt(
  segments: readonly TimelineSegment[],
  video: TimelineSegment,
  time: number,
  createSegmentId: SegmentIdFactory
): TimelineSegment[] {
  let next = [...segments];
  for (const audio of segments.filter((segment) => isLinkedRecordingAudio(video, segment))) {
    const cut = cutTimelineSegmentAt(next, audio.id, time, createSegmentId);
    if (cut) next = cut.segments;
  }
  return next;
}

/**
 * Remove segments together with the recording audio under any removed video.
 * With `linked: false` only the listed segments go (the video keeps no voice).
 */
export function removeTimelineSegmentsWithLinkedAudio(
  segments: readonly TimelineSegment[],
  segmentIds: readonly string[],
  createSegmentId: SegmentIdFactory,
  options: { linked?: boolean } = {}
): { segments: TimelineSegment[]; removedIds: string[] } {
  const requested = new Set(segmentIds);
  const isolated = options.linked === false
    ? { segments: [...segments], linkedIds: [] }
    : isolateLinkedRecordingAudio(segments, segmentIds, createSegmentId, requested);
  const removed = new Set([...requested, ...isolated.linkedIds]);
  return {
    segments: isolated.segments.filter((segment) => !removed.has(segment.id)),
    removedIds: isolated.segments
      .filter((segment) => removed.has(segment.id))
      .map((segment) => segment.id)
  };
}

/**
 * Trim a clip and move the same edge of its (already isolated) linked audio to
 * wherever the clip's edge landed, so the voice starts and stops with the
 * picture. Audio that runs out of media simply stops at its own end.
 */
export function trimTimelineSegmentWithLinkedAudio(
  segments: TimelineSegment[],
  segmentId: string,
  edge: TimelineTrimEdge,
  time: number,
  mediaDurationById: Map<string, number>,
  linkedIds: readonly string[]
): TimelineSegment[] {
  const trimmed = trimTimelineSegment(segments, segmentId, edge, time, mediaDurationById);
  const target = trimmed.find((segment) => segment.id === segmentId);
  if (!target || linkedIds.length === 0) {
    return trimmed;
  }

  const edgeTime = edge === "start" ? target.start : target.end;
  return linkedIds.reduce(
    (current, id) => trimTimelineSegment(current, id, edge, edgeTime, mediaDurationById),
    trimmed
  );
}

/**
 * Split one segment at a timeline time. Returns null when the cut would leave
 * a sliver thinner than `minimumLinkedPieceSeconds` on either side, in which
 * case the segment already lines up with the requested edge.
 */
export function cutTimelineSegmentAt(
  segments: readonly TimelineSegment[],
  segmentId: string,
  time: number,
  createSegmentId: SegmentIdFactory
): { segments: TimelineSegment[]; leftId: string; rightId: string } | null {
  const source = segments.find((segment) => segment.id === segmentId);
  if (
    !source ||
    time - source.start <= minimumLinkedPieceSeconds ||
    source.end - time <= minimumLinkedPieceSeconds
  ) {
    return null;
  }

  const resolved = source.pendingDuration ? { ...source, pendingDuration: false } : source;
  const right: TimelineSegment = {
    ...resolved,
    id: createSegmentId(source.id),
    start: time,
    sourceStart: source.sourceStart + (time - source.start)
  };
  return {
    leftId: source.id,
    rightId: right.id,
    segments: segments.flatMap((segment) =>
      segment.id === source.id ? [{ ...resolved, end: time }, right] : [segment]
    )
  };
}

function getSyncOffset(segment: TimelineSegment): number {
  return segment.start - segment.sourceStart;
}
