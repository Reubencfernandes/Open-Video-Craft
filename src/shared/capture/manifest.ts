/**
 * `capture-session.json` (manifest version 1) as written by the capture helper
 * and read by the importer (DATA_MODEL §5). Every `…HostNs` value is a decimal
 * string; nothing here converts a host time through a double.
 *
 * Pause method: this PoC records **method B** of DATA_MODEL §6.3 open question
 * 2 — a paused range leaves a gap on the capture axis. `pauses` stay owned by
 * `CaptureSession`; `TimeMap` never carries them.
 */
import { parseHostNs } from "../time/host-ns";
import { hostNsToTicks, type Ticks } from "../time/ticks";
import {
  TIMEMAP_OVERLAP,
  TimeMapError,
  assertTimeMapValid,
  type TimeMap,
  type TimeMapSegment
} from "../time/time-map";

export const CAPTURE_MANIFEST_VERSION = 1;

export type CaptureEngine = "native" | "chromium";
export type CaptureClockDomain = "host" | "chromium-monotonic";
export type CaptureTrackKind = "display" | "camera" | "mic" | "systemAudio";
export type CaptureTrackStatus = "recording" | "finalized" | "interrupted" | "failed";
export type CaptureSessionStatus = "recording" | "finalized" | "interrupted";
export type CaptureCodec = "hevc" | "h264" | "lpcm";

export interface CapturePauseV1 {
  /** Optional stable identifier used by the helper log; not part of the timing model. */
  readonly pauseId?: string;
  readonly startHostNs: string;
  readonly endHostNs: string;
}

export interface CaptureTrackSegmentV1 {
  readonly file: string;
  readonly firstPtsHostNs: string;
}

export interface CaptureTrackV1 {
  readonly trackId: string;
  readonly kind: CaptureTrackKind;
  readonly deviceId: string;
  readonly file: string;
  readonly codec: CaptureCodec;
  readonly width: number | null;
  readonly height: number | null;
  /** null = variable frame rate. */
  readonly fps: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
  readonly firstPtsHostNs: string;
  readonly lastPtsHostNs: string;
  readonly framesWritten: number;
  readonly framesDropped: number;
  /** Present when the track rolled over to a new file; index 0 is the first file. */
  readonly segments: readonly CaptureTrackSegmentV1[];
  readonly status: CaptureTrackStatus;
}

export interface CaptureHostClockV1 {
  readonly timebaseNumer: number;
  readonly timebaseDenom: number;
}

export interface CaptureManifestV1 {
  readonly manifestVersion: typeof CAPTURE_MANIFEST_VERSION;
  readonly sessionId: string;
  readonly engine: CaptureEngine;
  readonly clockDomain: CaptureClockDomain;
  readonly hostClock?: CaptureHostClockV1;
  readonly anchorHostNs: string;
  readonly pauses: readonly CapturePauseV1[];
  readonly tracks: readonly CaptureTrackV1[];
  readonly status: CaptureSessionStatus;
  readonly endedAtHostNs?: string;
  /** Set only by `--dry-run`: a plan manifest that must never be imported. */
  readonly dryRun?: boolean;
}

/** Document-level recording facts; the single owner of `pauses` (DATA_MODEL §6.3). */
export interface CaptureSession {
  readonly id: string;
  readonly engine: CaptureEngine;
  /** On the capture axis, half-open `[start, end)`. */
  readonly pauses: readonly { readonly startTicks: Ticks; readonly endTicks: Ticks }[];
  readonly endedAtTicks?: Ticks;
}

export type ManifestErrorCode =
  | "MANIFEST_UNSUPPORTED_VERSION"
  | "MANIFEST_TRACK_NOT_FOUND"
  | "MANIFEST_INVALID_TRACK"
  | "MANIFEST_INVALID_PAUSE"
  | "MANIFEST_SEGMENT_NOT_FOUND";

export class ManifestError extends Error {
  readonly code: ManifestErrorCode;

  constructor(code: ManifestErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ManifestError";
    this.code = code;
  }
}

function trackById(manifest: CaptureManifestV1, trackId: string): CaptureTrackV1 {
  if (manifest.manifestVersion !== CAPTURE_MANIFEST_VERSION) {
    throw new ManifestError(
      "MANIFEST_UNSUPPORTED_VERSION",
      `manifestVersion ${String(manifest.manifestVersion)} is not ${CAPTURE_MANIFEST_VERSION}`
    );
  }
  const track = manifest.tracks.find((candidate) => candidate.trackId === trackId);
  if (track === undefined) {
    throw new ManifestError("MANIFEST_TRACK_NOT_FOUND", `no track ${JSON.stringify(trackId)}`);
  }
  return track;
}

/** Pause ranges as `HostNs` pairs, sorted and validated as half-open. */
function pauseRanges(manifest: CaptureManifestV1): readonly { start: bigint; end: bigint }[] {
  const ranges = manifest.pauses.map((pause) => ({
    start: parseHostNs(pause.startHostNs),
    end: parseHostNs(pause.endHostNs)
  }));
  for (let index = 0; index < ranges.length; index += 1) {
    const current = ranges[index];
    if (current.end < current.start) {
      throw new ManifestError("MANIFEST_INVALID_PAUSE", `pause ${index} ends before it starts`);
    }
    if (index > 0 && current.start < ranges[index - 1].end) {
      throw new ManifestError("MANIFEST_INVALID_PAUSE", `pause ${index} overlaps pause ${index - 1}`);
    }
  }
  return ranges;
}

/** Converts the manifest's pauses once onto the capture axis (DATA_MODEL §6.3). */
export function manifestToCaptureSession(manifest: CaptureManifestV1): CaptureSession {
  const anchor = parseHostNs(manifest.anchorHostNs);
  const pauses = pauseRanges(manifest).map((range) => ({
    startTicks: hostNsToTicks(range.start - anchor),
    endTicks: hostNsToTicks(range.end - anchor)
  }));
  const endedAt = manifest.endedAtHostNs === undefined ? undefined : hostNsToTicks(parseHostNs(manifest.endedAtHostNs) - anchor);
  return {
    id: manifest.sessionId,
    engine: manifest.engine,
    pauses,
    ...(endedAt === undefined ? {} : { endedAtTicks: endedAt })
  };
}

/** Recorded pieces of `[start, end)` with every paused range removed. */
function recordedPieces(
  start: bigint,
  end: bigint,
  pauses: readonly { start: bigint; end: bigint }[]
): readonly { start: bigint; end: bigint }[] {
  const pieces: { start: bigint; end: bigint }[] = [];
  let cursor = start;
  for (const pause of pauses) {
    if (pause.end <= cursor) continue;
    if (pause.start >= end) break;
    const pieceEnd = pause.start < cursor ? cursor : pause.start;
    if (pieceEnd > cursor) pieces.push({ start: cursor, end: pieceEnd });
    cursor = pause.end > cursor ? pause.end : cursor;
    if (cursor >= end) break;
  }
  if (cursor < end) pieces.push({ start: cursor, end });
  return pieces;
}

/**
 * `TimeMap` for one file of one track. `segmentIndex` selects the rollover
 * segment: each rollover file is its own `MediaSource` with its own `TimeMap`
 * (DATA_MODEL §4 and §6.1), and paused ranges become capture-axis gaps.
 */
export function manifestToTimeMap(manifest: CaptureManifestV1, trackId: string, segmentIndex = 0): TimeMap {
  const track = trackById(manifest, trackId);
  const anchor = parseHostNs(manifest.anchorHostNs);
  const trackFirst = parseHostNs(track.firstPtsHostNs);
  const trackLast = parseHostNs(track.lastPtsHostNs);
  if (trackLast < trackFirst) {
    throw new ManifestError("MANIFEST_INVALID_TRACK", `track ${trackId} ends before it starts`);
  }
  const rollovers = track.segments.length === 0 ? [{ file: track.file, firstPtsHostNs: track.firstPtsHostNs }] : track.segments;
  if (segmentIndex < 0 || segmentIndex >= rollovers.length) {
    throw new ManifestError(
      "MANIFEST_SEGMENT_NOT_FOUND",
      `track ${trackId} has no segment ${segmentIndex} (${rollovers.length} files)`
    );
  }
  const start = segmentIndex === 0 ? trackFirst : parseHostNs(rollovers[segmentIndex].firstPtsHostNs);
  const nextRollover = rollovers[segmentIndex + 1];
  const end = nextRollover === undefined ? trackLast : parseHostNs(nextRollover.firstPtsHostNs);
  if (end <= start) {
    throw new TimeMapError({
      code: "TIMEMAP_OVERLAP",
      segmentIndex,
      detail: `rollover ${rollovers[segmentIndex].file} ends at ${end}, before its start ${start}`
    });
  }

  const segments: TimeMapSegment[] = [];
  let sourceCursor = 0n;
  for (const piece of recordedPieces(start, end, pauseRanges(manifest))) {
    const duration = piece.end - piece.start;
    segments.push({
      sourceStartTicks: sourceCursor,
      sourceDurationTicks: hostNsToTicks(duration),
      captureStartTicks: hostNsToTicks(piece.start - anchor),
      rateppm: 0
    });
    sourceCursor += hostNsToTicks(duration);
  }
  if (segments.length === 0) {
    throw new ManifestError("MANIFEST_INVALID_TRACK", `track ${trackId} has no recorded piece`);
  }

  const map: TimeMap = { segments, calibrationOffsetTicks: 0n };
  assertTimeMapValid(map);
  return map;
}

export { TIMEMAP_OVERLAP };
