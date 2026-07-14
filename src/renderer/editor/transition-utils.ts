import type { ClipTransition, ClipTransitionType, TimelineMediaClip } from "./types";

export const transitionOptions: ReadonlyArray<{
  type: ClipTransitionType;
  label: string;
}> = [
  { type: "crossfade", label: "Crossfade" },
  { type: "fade-black", label: "Fade black" },
  { type: "slide-left", label: "Slide left" },
  { type: "wipe-left", label: "Wipe left" }
];

export type TimelineTransitionBoundary = {
  key: string;
  from: TimelineMediaClip;
  to: TimelineMediaClip;
  cutTime: number;
};

export type ActiveTimelineTransition = TimelineTransitionBoundary & {
  transition: ClipTransition;
  progress: number;
};

/** Returns only real cuts: adjacent video clips that meet without a gap. */
export function getTimelineTransitionBoundaries(
  clips: TimelineMediaClip[]
): TimelineTransitionBoundary[] {
  const ordered = [...clips].sort((a, b) => a.start - b.start);
  return ordered.slice(0, -1).flatMap((from, index) => {
    const to = ordered[index + 1];
    const cutTime = from.start + from.duration;
    return Math.abs(cutTime - to.start) <= 0.05
      ? [{ key: getTransitionBoundaryKey(from.id, to.id), from, to, cutTime }]
      : [];
  });
}

export function getTransitionBoundaryKey(fromSegmentId: string, toSegmentId: string): string {
  return `${fromSegmentId}\u0000${toSegmentId}`;
}

export function getMaxTransitionDuration(boundary: TimelineTransitionBoundary): number {
  return Math.max(
    0.1,
    Math.min(
      2,
      (boundary.from.duration - 0.1) * 2,
      (boundary.to.duration - 0.1) * 2
    )
  );
}

export function getNearestTransitionBoundary(
  boundaries: TimelineTransitionBoundary[],
  time: number
): TimelineTransitionBoundary | null {
  return boundaries.reduce<TimelineTransitionBoundary | null>((nearest, boundary) => {
    if (!nearest) return boundary;
    return Math.abs(boundary.cutTime - time) < Math.abs(nearest.cutTime - time)
      ? boundary
      : nearest;
  }, null);
}

export function isClipTransitionType(value: string): value is ClipTransitionType {
  return transitionOptions.some((option) => option.type === value);
}

/** Finds the transition window under the playhead and its normalized progress. */
export function getActiveTimelineTransition(
  clips: TimelineMediaClip[],
  transitions: ClipTransition[],
  time: number
): ActiveTimelineTransition | null {
  for (const boundary of getTimelineTransitionBoundaries(clips)) {
    const transition = transitions.find((item) =>
      item.fromSegmentId === boundary.from.id && item.toSegmentId === boundary.to.id
    );
    if (!transition) continue;
    const start = boundary.cutTime - transition.duration / 2;
    const end = start + transition.duration;
    if (time < start || time > end) continue;
    return {
      ...boundary,
      transition,
      progress: Math.max(0, Math.min(1, (time - start) / transition.duration))
    };
  }
  return null;
}
