export type ZoomTimingItem = {
  id: string;
  start: number;
  end: number;
};

export const zoomMinDurationSeconds = 0.2;
export const zoomOverlapToleranceSeconds = 0.01;

export function placeZoomInFirstGap(
  effects: ZoomTimingItem[],
  requestedStart: number,
  duration: number,
  timelineDuration: number
): { start: number; end: number } | null {
  const safeDuration = Math.max(zoomMinDurationSeconds, duration);
  const maxStart = Math.max(0, timelineDuration - safeDuration);
  let start = clampZoomTime(requestedStart, 0, maxStart);

  for (const effect of getOrderedZoomTimingItems(effects)) {
    if (start + safeDuration <= effect.start + zoomOverlapToleranceSeconds) {
      return {
        start,
        end: start + safeDuration
      };
    }

    if (start < effect.end - zoomOverlapToleranceSeconds) {
      start = effect.end;
      if (start > maxStart + zoomOverlapToleranceSeconds) {
        return null;
      }
    }
  }

  if (start + safeDuration <= timelineDuration + zoomOverlapToleranceSeconds) {
    return {
      start,
      end: start + safeDuration
    };
  }

  return null;
}

export function constrainZoomMove(
  effects: ZoomTimingItem[],
  id: string,
  rawStart: number,
  timelineDuration: number
): { start: number; end: number } | null {
  const effect = effects.find((item) => item.id === id);
  if (!effect) {
    return null;
  }

  const duration = Math.max(zoomMinDurationSeconds, effect.end - effect.start);
  const { previous, next } = getZoomTimingNeighbors(effects, id);
  const minStart = Math.max(0, previous?.end ?? 0);
  const maxStart = Math.min(
    Math.max(0, timelineDuration - duration),
    next ? next.start - duration : Number.POSITIVE_INFINITY
  );
  const start = clampZoomTime(rawStart, minStart, maxStart);

  return {
    start,
    end: start + duration
  };
}

export function constrainZoomStart(
  effects: ZoomTimingItem[],
  id: string,
  rawStart: number
): { start: number } | null {
  const effect = effects.find((item) => item.id === id);
  if (!effect) {
    return null;
  }

  const { previous } = getZoomTimingNeighbors(effects, id);
  return {
    start: clampZoomTime(rawStart, previous?.end ?? 0, effect.end - zoomMinDurationSeconds)
  };
}

export function constrainZoomEnd(
  effects: ZoomTimingItem[],
  id: string,
  rawEnd: number,
  timelineDuration: number
): { end: number } | null {
  const effect = effects.find((item) => item.id === id);
  if (!effect) {
    return null;
  }

  const { next } = getZoomTimingNeighbors(effects, id);
  return {
    end: clampZoomTime(
      rawEnd,
      effect.start + zoomMinDurationSeconds,
      Math.min(timelineDuration, next?.start ?? Number.POSITIVE_INFINITY)
    )
  };
}

export function zoomRangesOverlap(
  first: Pick<ZoomTimingItem, "start" | "end">,
  second: Pick<ZoomTimingItem, "start" | "end">
): boolean {
  return (
    first.start < second.end - zoomOverlapToleranceSeconds &&
    first.end > second.start + zoomOverlapToleranceSeconds
  );
}

export function getOrderedZoomTimingItems<T extends ZoomTimingItem>(effects: T[]): T[] {
  return [...effects].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}

function getZoomTimingNeighbors(
  effects: ZoomTimingItem[],
  id: string
): { previous: ZoomTimingItem | null; next: ZoomTimingItem | null } {
  const ordered = getOrderedZoomTimingItems(effects);
  const index = ordered.findIndex((effect) => effect.id === id);

  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null
  };
}

function clampZoomTime(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  return Math.min(Math.max(value, safeMin), Math.max(safeMin, safeMax));
}
