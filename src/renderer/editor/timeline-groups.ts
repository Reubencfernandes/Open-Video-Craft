/**
 * Adjacent clips on the same channel form one block, so pressing any of them
 * moves the whole run instead of a single piece.
 *
 * The grouping is derived from geometry on every render: a persisted group id
 * would need a schema change and a migration for a concept the timeline already
 * expresses by contiguity. Media stay untouched — a group only decides what a
 * press selects.
 */
import type { TimelineMediaClip } from "./types";

/** Two clips are contiguous when they touch within this tolerance, like cuts. */
export const timelineGroupToleranceSeconds = 0.05;

/** The minimum shape of a timeline range: segments and rendered clips both fit. */
export type TimelineGroupableClip = {
  id: string;
  track: "video" | "audio";
  lane: number;
  start: number;
  end: number;
  hidden?: boolean;
};

export type TimelineClipGroup = {
  track: "video" | "audio";
  lane: number;
  ids: string[];
};

/**
 * Where a clip sits inside its block. The look of a block follows from it: the
 * inner edges of its members must lose their rounding and their border so the
 * run reads as one piece, while the outer edges keep the single-clip styling.
 */
export type TimelineClipGroupRole = "single" | "start" | "middle" | "end";

/** Normalizes a rendered clip to the range shape the grouping works on. */
export function toTimelineGroupableClip(clip: TimelineMediaClip): TimelineGroupableClip {
  return {
    id: clip.id,
    track: clip.track,
    lane: clip.lane,
    start: clip.start,
    end: clip.start + clip.duration,
    hidden: clip.hidden
  };
}

export function getTimelineClipGroups(
  clips: readonly TimelineGroupableClip[]
): TimelineClipGroup[] {
  const lanes = new Map<string, TimelineGroupableClip[]>();
  for (const clip of clips) {
    if (clip.hidden === true) continue;
    const key = `${clip.track}:${clip.lane}`;
    lanes.set(key, [...(lanes.get(key) ?? []), clip]);
  }

  return [...lanes.values()].flatMap((laneClips) => {
    const ordered = [...laneClips].sort(
      (first, second) => first.start - second.start || first.id.localeCompare(second.id)
    );
    const groups: TimelineClipGroup[] = [];
    let current: TimelineGroupableClip[] = [];
    for (const clip of ordered) {
      const previous = current[current.length - 1];
      const contiguous =
        previous !== undefined &&
        Math.abs(previous.end - clip.start) <= timelineGroupToleranceSeconds;
      if (!contiguous && current.length > 0) {
        groups.push(toGroup(current));
        current = [];
      }
      current.push(clip);
    }
    if (current.length > 0) groups.push(toGroup(current));
    return groups.filter((group) => group.ids.length > 1);
  });
}

function toGroup(clips: readonly TimelineGroupableClip[]): TimelineClipGroup {
  return {
    track: clips[0].track,
    lane: clips[0].lane,
    ids: clips.map((clip) => clip.id)
  };
}

/** Ids of the block a clip belongs to, or just that clip when it stands alone. */
export function getTimelineClipGroupIds(
  clips: readonly TimelineGroupableClip[],
  clipId: string
): string[] {
  const group = getTimelineClipGroups(clips).find((candidate) =>
    candidate.ids.includes(clipId)
  );
  return group ? [...group.ids] : [clipId];
}

/**
 * The role of every clip keyed by id, from one grouping pass: a render reads
 * the map per clip instead of regrouping the whole timeline for each one.
 */
export function getTimelineClipGroupRoles(
  clips: readonly TimelineGroupableClip[]
): Map<string, TimelineClipGroupRole> {
  const roles = new Map<string, TimelineClipGroupRole>();
  for (const clip of clips) roles.set(clip.id, "single");

  for (const group of getTimelineClipGroups(clips)) {
    group.ids.forEach((id, index) => {
      const last = group.ids.length - 1;
      roles.set(id, index === 0 ? "start" : index === last ? "end" : "middle");
    });
  }

  return roles;
}

/** The role of one clip in its block; a clip with no neighbour is "single". */
export function getTimelineClipGroupRole(
  clips: readonly TimelineGroupableClip[],
  clipId: string
): TimelineClipGroupRole {
  return getTimelineClipGroupRoles(clips).get(clipId) ?? "single";
}
