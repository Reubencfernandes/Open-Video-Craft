/**
 * Click-driven automatic zoom (S2, S4): a pure, deterministic conversion of the
 * global clicks recorded during a screen capture into editable zoom effects for
 * the existing zoom lane. Nothing here touches the recorder, Electron, or the
 * recorded pixels: the output is an effect list the editor can edit and the AI
 * can later change to 3x through the public `set_zoom` operation.
 *
 * Input timestamps are already on the timeline (capture) axis in seconds: the
 * caller maps `clickHostNs` through the same `TimeMap` it used for the recorded
 * video track, so pauses are already removed and no clock is guessed here.
 *
 * Determinism: clicks are ordered by time and point, nearby clicks merge into
 * one window, every value is rounded to milliseconds/percent hundredths, and
 * ids are ordinal, so the same events always produce the same effects.
 */
import type { ZoomEffect, ZoomSpeed } from "./types";

/** S2: auto zoom starts at 2x; the AI may later change it to 3x or anything else. */
export const AUTO_ZOOM_SCALE = 2;
export const AUTO_ZOOM_SPEED: ZoomSpeed = "medium";

/** Each click gets a short lead-in, a readable hold, and a gentle lead-out. */
export const AUTO_ZOOM_LEAD_IN_SECONDS = 0.35;
export const AUTO_ZOOM_HOLD_SECONDS = 1.6;
export const AUTO_ZOOM_LEAD_OUT_SECONDS = 0.55;

/** Clicks whose windows are this close (or overlapping) become one effect. */
export const AUTO_ZOOM_MERGE_GAP_SECONDS = 0.8;

/** Targets stay this far from the frame edge so a 2x frame is never cut off. */
export const AUTO_ZOOM_TARGET_INSET_PERCENT = 10;

/** Shortest effect kept after timeline clamping; the editor rejects < 0.2s. */
export const AUTO_ZOOM_MIN_DURATION_SECONDS = 0.25;

/** Natural lead-out of a single click window, after the hold. */
const AUTO_ZOOM_TAIL_SECONDS = AUTO_ZOOM_HOLD_SECONDS + AUTO_ZOOM_LEAD_OUT_SECONDS;

export interface AutoZoomClick {
  /** Position on the capture/timeline axis, in seconds. */
  readonly timeSeconds: number;
  /** Quartz global display coordinate of the click, in points. */
  readonly xPoints: number;
  readonly yPoints: number;
}

/** Display bounds in the same global point space as `AutoZoomClick`. */
export interface AutoZoomDisplay {
  readonly displayId: string;
  readonly originXPoints: number;
  readonly originYPoints: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly primary?: boolean;
}

export interface AutoZoomInput {
  readonly clicks: readonly AutoZoomClick[];
  readonly displays: readonly AutoZoomDisplay[];
  /** Timeline length: no generated effect may end after this point. */
  readonly durationSeconds: number;
  /** Recorded display; clicks on other displays are ignored. Defaults to the primary display. */
  readonly displayId?: string;
}

export interface AutoZoomTarget {
  /** Percentage of the display width, clamped to a safe inset. */
  readonly targetX: number;
  /** Percentage of the display height, clamped to a safe inset. */
  readonly targetY: number;
}

interface NormalizedClick {
  readonly timeSeconds: number;
  readonly target: AutoZoomTarget;
}

interface ZoomWindow {
  start: number;
  end: number;
  targetXSum: number;
  targetYSum: number;
  count: number;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareDisplayIds(left: AutoZoomDisplay, right: AutoZoomDisplay): number {
  if (left.displayId < right.displayId) return -1;
  if (left.displayId > right.displayId) return 1;
  return 0;
}

/** A display is usable only when its bounds describe a non-empty rectangle. */
function hasUsableBounds(display: AutoZoomDisplay): boolean {
  return (
    Number.isFinite(display.originXPoints) &&
    Number.isFinite(display.originYPoints) &&
    Number.isFinite(display.widthPoints) &&
    Number.isFinite(display.heightPoints) &&
    display.widthPoints > 0 &&
    display.heightPoints > 0
  );
}

function containsPoint(display: AutoZoomDisplay, click: AutoZoomClick): boolean {
  return (
    click.xPoints >= display.originXPoints &&
    click.xPoints <= display.originXPoints + display.widthPoints &&
    click.yPoints >= display.originYPoints &&
    click.yPoints <= display.originYPoints + display.heightPoints
  );
}

/**
 * Clicks the recorded display, in deterministic id order, so a point that two
 * displays claim (mirrored screens, shared edges) always resolves the same way.
 */
function displayContainingClick(
  displays: readonly AutoZoomDisplay[],
  click: AutoZoomClick
): AutoZoomDisplay | null {
  const matching = displays.filter((display) => containsPoint(display, click)).sort(compareDisplayIds);
  return matching[0] ?? null;
}

function resolveRecordedDisplay(input: AutoZoomInput): AutoZoomDisplay | null {
  const usable = input.displays.filter(hasUsableBounds);
  if (usable.length === 0) return null;
  if (input.displayId !== undefined) {
    return usable.find((display) => display.displayId === input.displayId) ?? null;
  }
  const ordered = [...usable].sort(compareDisplayIds);
  return ordered.find((display) => display.primary === true) ?? ordered[0];
}

/**
 * Display-relative percentage of one click, clamped to
 * `[AUTO_ZOOM_TARGET_INSET_PERCENT, 100 - AUTO_ZOOM_TARGET_INSET_PERCENT]` so
 * edge clicks keep the clicked point inside the 2x frame.
 */
export function autoZoomTarget(
  click: Pick<AutoZoomClick, "xPoints" | "yPoints">,
  display: AutoZoomDisplay
): AutoZoomTarget {
  const rawX = ((click.xPoints - display.originXPoints) / display.widthPoints) * 100;
  const rawY = ((click.yPoints - display.originYPoints) / display.heightPoints) * 100;
  const minimum = AUTO_ZOOM_TARGET_INSET_PERCENT;
  const maximum = 100 - AUTO_ZOOM_TARGET_INSET_PERCENT;
  return {
    targetX: roundPercent(clamp(rawX, minimum, maximum)),
    targetY: roundPercent(clamp(rawY, minimum, maximum))
  };
}

function normalizedClicks(input: AutoZoomInput): NormalizedClick[] {
  const recordedDisplay = resolveRecordedDisplay(input);
  if (recordedDisplay === null) return [];
  const usable = input.displays.filter(hasUsableBounds);

  const normalized: NormalizedClick[] = [];
  for (const click of input.clicks) {
    if (!Number.isFinite(click.timeSeconds) || !Number.isFinite(click.xPoints) || !Number.isFinite(click.yPoints)) {
      continue;
    }
    // With an explicit display only clicks it contains count; without one each
    // click is normalized against the display it actually landed on.
    const clickDisplay =
      input.displayId === undefined
        ? displayContainingClick(usable, click)
        : containsPoint(recordedDisplay, click)
          ? recordedDisplay
          : null;
    if (clickDisplay === null) continue;
    normalized.push({ timeSeconds: click.timeSeconds, target: autoZoomTarget(click, clickDisplay) });
  }

  normalized.sort((left, right) =>
    left.timeSeconds - right.timeSeconds ||
    left.target.targetX - right.target.targetX ||
    left.target.targetY - right.target.targetY
  );
  return normalized;
}

/** Merges clicks whose zoom windows would overlap or nearly touch. */
function mergeWindows(clicks: readonly NormalizedClick[]): ZoomWindow[] {
  const windows: ZoomWindow[] = [];
  for (const click of clicks) {
    const start = click.timeSeconds - AUTO_ZOOM_LEAD_IN_SECONDS;
    const end = click.timeSeconds + AUTO_ZOOM_TAIL_SECONDS;
    const previous = windows[windows.length - 1];
    if (previous !== undefined && start <= previous.end + AUTO_ZOOM_MERGE_GAP_SECONDS) {
      previous.end = Math.max(previous.end, end);
      previous.targetXSum += click.target.targetX;
      previous.targetYSum += click.target.targetY;
      previous.count += 1;
      continue;
    }
    windows.push({
      start,
      end,
      targetXSum: click.target.targetX,
      targetYSum: click.target.targetY,
      count: 1
    });
  }
  return windows;
}

/**
 * Converts recorded clicks into non-overlapping 2x zoom effects on the timeline.
 * Effects outside `[0, durationSeconds]` are clipped, and a clipped effect too
 * short to hold is dropped rather than left as a flicker.
 */
export function generateAutoZoomEffects(input: AutoZoomInput): ZoomEffect[] {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) return [];

  const effects: ZoomEffect[] = [];
  for (const window of mergeWindows(normalizedClicks(input))) {
    const start = roundSeconds(Math.max(0, window.start));
    const end = roundSeconds(Math.min(input.durationSeconds, window.end));
    if (end - start < AUTO_ZOOM_MIN_DURATION_SECONDS) continue;
    effects.push({
      id: `auto-zoom-${effects.length + 1}`,
      start,
      end,
      speed: AUTO_ZOOM_SPEED,
      scale: AUTO_ZOOM_SCALE,
      targetX: roundPercent(window.targetXSum / window.count),
      targetY: roundPercent(window.targetYSum / window.count)
    });
  }
  return effects;
}
