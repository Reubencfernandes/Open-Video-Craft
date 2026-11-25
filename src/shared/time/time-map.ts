/**
 * `TimeMap` — source time (`s`) to capture time (`c`) for one media file
 * (DATA_MODEL §6.3, normative). Segments are half-open on both axes, the
 * segment/drift term is applied first and the calibration offset `K` last.
 *
 * `rateppm` is enforced to 0 until G1-CAPTURE measures drift on the target
 * machine; the formula keeps the field so the measurement enables it later
 * without a migration.
 */
import { divRound, type Ticks } from "./ticks";

/** Assertion code emitted for a `TimeMap` invalidated by overlapping segments. */
export const TIMEMAP_OVERLAP = "TIMEMAP_OVERLAP";

/** Drift is not measured yet, so the only accepted rate is 0 ppm. */
export const RATE_PPM_UNMEASURED = 0;
/** Beyond this the value is an error, not drift (DATA_MODEL §6.3). */
export const MAX_ABSOLUTE_RATE_PPM = 10_000;

export interface TimeMapSegment {
  /** `S_i` on the source axis. */
  readonly sourceStartTicks: Ticks;
  /** `D_i` > 0, measured on the source axis. */
  readonly sourceDurationTicks: Ticks;
  /** `C_i` on the capture axis, before calibration. */
  readonly captureStartTicks: Ticks;
  /** `r_i`, integer ppm, signed. */
  readonly rateppm: number;
}

export interface TimeMap {
  /** At least one segment, sorted by `sourceStartTicks`. */
  readonly segments: readonly TimeMapSegment[];
  /** `K`: source-wide, signed, applied last. */
  readonly calibrationOffsetTicks: Ticks;
}

export type TimeMapIssueCode =
  | "TIMEMAP_EMPTY"
  | "TIMEMAP_UNSORTED"
  | "TIMEMAP_OVERLAP"
  | "TIMEMAP_SOURCE_DURATION"
  | "TIMEMAP_RATE_UNMEASURED"
  | "TIMEMAP_RATE_OUT_OF_RANGE";

export interface TimeMapIssue {
  readonly code: TimeMapIssueCode;
  readonly segmentIndex: number;
  readonly detail: string;
}

/** Raised by {@link assertTimeMapValid}; `code` carries the assertion name. */
export class TimeMapError extends Error {
  readonly code: TimeMapIssueCode;
  readonly issues: readonly TimeMapIssue[];

  constructor(issue: TimeMapIssue) {
    super(`${issue.code}: segment ${issue.segmentIndex} ${issue.detail}`);
    this.name = "TimeMapError";
    this.code = issue.code;
    this.issues = [issue];
  }
}

/** Capture-axis length of a segment, `c(S_i + D_i) − c(S_i)` without `K`. */
export function segmentCaptureDuration(segment: TimeMapSegment): Ticks {
  return divRound(segment.sourceDurationTicks * BigInt(1_000_000 + segment.rateppm), 1_000_000n);
}

export function validateTimeMap(map: TimeMap): readonly TimeMapIssue[] {
  const issues: TimeMapIssue[] = [];
  if (map.segments.length === 0) {
    issues.push({ code: "TIMEMAP_EMPTY", segmentIndex: -1, detail: "has no segments" });
    return issues;
  }

  map.segments.forEach((segment, index) => {
    if (segment.sourceDurationTicks <= 0n) {
      issues.push({
        code: "TIMEMAP_SOURCE_DURATION",
        segmentIndex: index,
        detail: `has sourceDurationTicks ${segment.sourceDurationTicks}`
      });
    }
    const rate = segment.rateppm;
    if (Math.abs(rate) > MAX_ABSOLUTE_RATE_PPM) {
      issues.push({
        code: "TIMEMAP_RATE_OUT_OF_RANGE",
        segmentIndex: index,
        detail: `has rateppm ${rate} outside ±${MAX_ABSOLUTE_RATE_PPM}`
      });
    } else if (rate !== RATE_PPM_UNMEASURED) {
      issues.push({
        code: "TIMEMAP_RATE_UNMEASURED",
        segmentIndex: index,
        detail: `has rateppm ${rate} while drift is unmeasured`
      });
    }
    if (!Number.isInteger(rate)) {
      issues.push({
        code: "TIMEMAP_RATE_UNMEASURED",
        segmentIndex: index,
        detail: `has non-integer rateppm ${rate}`
      });
    }
  });

  for (let index = 1; index < map.segments.length; index += 1) {
    const previous = map.segments[index - 1];
    const current = map.segments[index];
    if (current.sourceStartTicks < previous.sourceStartTicks) {
      issues.push({
        code: "TIMEMAP_UNSORTED",
        segmentIndex: index,
        detail: `starts at ${current.sourceStartTicks} before ${previous.sourceStartTicks}`
      });
      continue;
    }
    const previousEnd = previous.sourceStartTicks + previous.sourceDurationTicks;
    if (previousEnd > current.sourceStartTicks) {
      issues.push({
        code: "TIMEMAP_OVERLAP",
        segmentIndex: index,
        detail: `overlaps the previous segment on the source axis (${previousEnd} > ${current.sourceStartTicks})`
      });
    }
    const previousCaptureEnd = previous.captureStartTicks + segmentCaptureDuration(previous);
    if (previousCaptureEnd > current.captureStartTicks) {
      issues.push({
        code: "TIMEMAP_OVERLAP",
        segmentIndex: index,
        detail: `overlaps the previous segment on the capture axis (${previousCaptureEnd} > ${current.captureStartTicks})`
      });
    }
  }

  return issues;
}

export function assertTimeMapValid(map: TimeMap): void {
  const firstIssue = validateTimeMap(map)[0];
  if (firstIssue !== undefined) throw new TimeMapError(firstIssue);
}

/**
 * `c(s) = C_i + divRound((s − S_i) · (1,000,000 + r_i), 1,000,000) + K` for the
 * half-open source interval `[S_i, S_i + D_i)`; undefined outside every segment.
 */
export function mapSourceToCapture(map: TimeMap, sourceTicks: Ticks): Ticks | undefined {
  for (const segment of map.segments) {
    if (sourceTicks < segment.sourceStartTicks) return undefined;
    const sourceEnd = segment.sourceStartTicks + segment.sourceDurationTicks;
    if (sourceTicks >= sourceEnd) continue;
    const delta = sourceTicks - segment.sourceStartTicks;
    const scaled = divRound(delta * BigInt(1_000_000 + segment.rateppm), 1_000_000n);
    return segment.captureStartTicks + scaled + map.calibrationOffsetTicks;
  }
  return undefined;
}

/**
 * Inverse `s(c)`; exists only where `c − K` lies in the image of a segment, so
 * a capture time inside a pause or a device-loss gap is undefined (the caller
 * decides hold semantics, this module never invents a sample).
 */
export function mapCaptureToSource(map: TimeMap, captureTicks: Ticks): Ticks | undefined {
  const local = captureTicks - map.calibrationOffsetTicks;
  for (const segment of map.segments) {
    if (local < segment.captureStartTicks) return undefined;
    const captureEnd = segment.captureStartTicks + segmentCaptureDuration(segment);
    if (local >= captureEnd) continue;
    const delta = local - segment.captureStartTicks;
    const sourceDelta = divRound(delta * 1_000_000n, BigInt(1_000_000 + segment.rateppm));
    const clamped = sourceDelta >= segment.sourceDurationTicks ? segment.sourceDurationTicks - 1n : sourceDelta;
    return segment.sourceStartTicks + clamped;
  }
  return undefined;
}
