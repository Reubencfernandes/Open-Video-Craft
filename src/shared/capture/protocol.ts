/**
 * Capture helper protocol v1: one JSON object per line on stdout
 * (`native/protocol/v1/schema.json` is the shared contract). Emitted by
 * `ovc-capture-poc`; consumed by the bench harness and, later, by the importer.
 *
 * `…HostNs` values are decimal strings because they exceed 2^53; the parser
 * rejects numbers so a truncated value can never enter the pipeline.
 */
import { HostNsParseError, parseHostNs } from "../time/host-ns";

export const PROTOCOL_VERSION = 1;

export const PROTOCOL_V1_EVENT_NAMES = [
  "session.start",
  "devices",
  "stats",
  "track.first_pts",
  "pauses",
  "track.finalized",
  "session.finalized",
  "device.lost"
] as const;

export type ProtocolV1EventName = (typeof PROTOCOL_V1_EVENT_NAMES)[number];

export type CaptureRunMode = "dry-run" | "live";
export type SystemAudioMode = "sck" | "tap";
export type CaptureCodecName = "hevc" | "h264";
export type CaptureFps = 30 | 60;

interface ProtocolV1Envelope {
  readonly v: typeof PROTOCOL_VERSION;
  readonly seq: number;
  readonly tHostNs: string;
  readonly event: ProtocolV1EventName;
}

export interface SessionStartEvent extends ProtocolV1Envelope {
  readonly event: "session.start";
  readonly sessionId: string;
  readonly engine: "native";
  readonly clockDomain: "host";
  readonly anchorHostNs: string;
  readonly mode: CaptureRunMode;
  readonly codec: CaptureCodecName;
  readonly fps: CaptureFps;
  readonly durationSeconds: number;
  readonly out: string;
}

export interface DevicesEvent extends ProtocolV1Envelope {
  readonly event: "devices";
  readonly displays: readonly string[];
  readonly cameras: readonly string[];
  readonly microphones: readonly string[];
  readonly systemAudio: SystemAudioMode;
  readonly source: CaptureRunMode;
}

export interface TrackStatsV1 {
  readonly trackId: string;
  readonly framesWritten: number;
  readonly framesDropped: number;
}

export interface StatsEvent extends ProtocolV1Envelope {
  readonly event: "stats";
  readonly elapsedSeconds: number;
  readonly tracks: readonly TrackStatsV1[];
}

export interface TrackFirstPtsEvent extends ProtocolV1Envelope {
  readonly event: "track.first_pts";
  readonly trackId: string;
  readonly firstPtsHostNs: string;
}

export interface PausesEvent extends ProtocolV1Envelope {
  readonly event: "pauses";
  readonly pauseIndex: number;
  readonly startHostNs: string;
  readonly endHostNs: string;
}

export interface TrackSegmentV1 {
  readonly file: string;
  readonly firstPtsHostNs: string;
}

export interface TrackFinalizedEvent extends ProtocolV1Envelope {
  readonly event: "track.finalized";
  readonly trackId: string;
  readonly file: string;
  readonly firstPtsHostNs: string;
  readonly lastPtsHostNs: string;
  readonly framesWritten: number;
  readonly framesDropped: number;
  readonly segments: readonly TrackSegmentV1[];
  readonly status: "finalized";
}

export interface SessionFinalizedEvent extends ProtocolV1Envelope {
  readonly event: "session.finalized";
  readonly sessionId: string;
  readonly endedAtHostNs: string;
  readonly manifestPath: string;
  readonly trackIds: readonly string[];
  readonly status: "finalized";
}

export interface DeviceLostEvent extends ProtocolV1Envelope {
  readonly event: "device.lost";
  readonly trackId: string;
  readonly reason: string;
}

export type ProtocolV1Event =
  | SessionStartEvent
  | DevicesEvent
  | StatsEvent
  | TrackFirstPtsEvent
  | PausesEvent
  | TrackFinalizedEvent
  | SessionFinalizedEvent
  | DeviceLostEvent;

export type ProtocolV1ErrorCode = "PROTOCOL_INVALID_JSON" | "PROTOCOL_INVALID_EVENT" | "PROTOCOL_INVALID_FIELD";

export class ProtocolV1Error extends Error {
  readonly code: ProtocolV1ErrorCode;

  constructor(code: ProtocolV1ErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ProtocolV1Error";
    this.code = code;
  }
}

type JsonRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not an object`);
  }
  return value as JsonRecord;
}

function readString(record: JsonRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not a string`);
  }
  return value;
}

function readLiteral<T extends string>(record: JsonRecord, field: string, allowed: readonly T[]): T {
  const value = readString(record, field);
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not one of ${allowed.join("|")}`);
  }
  return match;
}

function readInteger(record: JsonRecord, field: string, minimum: number): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not an integer >= ${minimum}`);
  }
  return value;
}

function readIntegerChoice<T extends number>(record: JsonRecord, field: string, allowed: readonly T[]): T {
  const value = record[field];
  if (typeof value !== "number") {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not a number`);
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not one of ${allowed.join("|")}`);
  }
  return match;
}

function readFiniteNumber(record: JsonRecord, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not a finite number`);
  }
  return value;
}

function readHostNs(record: JsonRecord, field: string): string {
  const value = readString(record, field);
  try {
    parseHostNs(value);
  } catch (error) {
    if (error instanceof HostNsParseError) {
      throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not a HostNs decimal string`);
    }
    throw error;
  }
  return value;
}

function readStringArray(record: JsonRecord, field: string): readonly string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field} is not an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", `${field}[${index}] is not a string`);
    }
    return entry;
  });
}

function readEventName(record: JsonRecord): ProtocolV1EventName {
  const value = readString(record, "event");
  const match = PROTOCOL_V1_EVENT_NAMES.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_EVENT", `unknown event ${JSON.stringify(value)}`);
  }
  return match;
}

function readEnvelope(record: JsonRecord, event: ProtocolV1EventName): ProtocolV1Envelope {
  if (record.v !== PROTOCOL_VERSION) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_EVENT", `unsupported protocol version ${String(record.v)}`);
  }
  const seq = readInteger(record, "seq", 0);
  const tHostNs = readHostNs(record, "tHostNs");
  return { v: PROTOCOL_VERSION, seq, tHostNs, event };
}

/**
 * Parses one protocol v1 line. Extra fields are preserved by the caller's
 * forward-compatible parsing only when their event declares them; unknown
 * events and malformed fields are rejected with a coded error.
 */
export function parseProtocolV1Line(line: string): ProtocolV1Event {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new ProtocolV1Error("PROTOCOL_INVALID_JSON", "line is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ProtocolV1Error("PROTOCOL_INVALID_JSON", "line is not a protocol v1 object");
  }
  const record = asRecord(parsed, "line");
  const event = readEventName(record);
  const envelope = readEnvelope(record, event);

  switch (event) {
    case "session.start":
      return {
        ...envelope,
        event,
        sessionId: readString(record, "sessionId"),
        engine: readLiteral(record, "engine", ["native"] as const),
        clockDomain: readLiteral(record, "clockDomain", ["host"] as const),
        anchorHostNs: readHostNs(record, "anchorHostNs"),
        mode: readLiteral(record, "mode", ["dry-run", "live"] as const),
        codec: readLiteral(record, "codec", ["hevc", "h264"] as const),
        fps: readIntegerChoice(record, "fps", [30, 60] as const),
        durationSeconds: readFiniteNumber(record, "durationSeconds"),
        out: readString(record, "out")
      };
    case "devices":
      return {
        ...envelope,
        event,
        displays: readStringArray(record, "displays"),
        cameras: readStringArray(record, "cameras"),
        microphones: readStringArray(record, "microphones"),
        systemAudio: readLiteral(record, "systemAudio", ["sck", "tap"] as const),
        source: readLiteral(record, "source", ["dry-run", "live"] as const)
      };
    case "stats": {
      const tracks = record.tracks;
      if (!Array.isArray(tracks)) {
        throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", "tracks is not an array");
      }
      return {
        ...envelope,
        event,
        elapsedSeconds: readFiniteNumber(record, "elapsedSeconds"),
        tracks: tracks.map((entry, index) => {
          const trackRecord = asRecord(entry, `tracks[${index}]`);
          return {
            trackId: readString(trackRecord, "trackId"),
            framesWritten: readInteger(trackRecord, "framesWritten", 0),
            framesDropped: readInteger(trackRecord, "framesDropped", 0)
          };
        })
      };
    }
    case "track.first_pts":
      return {
        ...envelope,
        event,
        trackId: readString(record, "trackId"),
        firstPtsHostNs: readHostNs(record, "firstPtsHostNs")
      };
    case "pauses":
      return {
        ...envelope,
        event,
        pauseIndex: readInteger(record, "pauseIndex", 0),
        startHostNs: readHostNs(record, "startHostNs"),
        endHostNs: readHostNs(record, "endHostNs")
      };
    case "track.finalized": {
      const segments = record.segments;
      if (!Array.isArray(segments)) {
        throw new ProtocolV1Error("PROTOCOL_INVALID_FIELD", "segments is not an array");
      }
      return {
        ...envelope,
        event,
        trackId: readString(record, "trackId"),
        file: readString(record, "file"),
        firstPtsHostNs: readHostNs(record, "firstPtsHostNs"),
        lastPtsHostNs: readHostNs(record, "lastPtsHostNs"),
        framesWritten: readInteger(record, "framesWritten", 0),
        framesDropped: readInteger(record, "framesDropped", 0),
        segments: segments.map((entry, index) => {
          const segmentRecord = asRecord(entry, `segments[${index}]`);
          return {
            file: readString(segmentRecord, "file"),
            firstPtsHostNs: readHostNs(segmentRecord, "firstPtsHostNs")
          };
        }),
        status: readLiteral(record, "status", ["finalized"] as const)
      };
    }
    case "session.finalized":
      return {
        ...envelope,
        event,
        sessionId: readString(record, "sessionId"),
        endedAtHostNs: readHostNs(record, "endedAtHostNs"),
        manifestPath: readString(record, "manifestPath"),
        trackIds: readStringArray(record, "trackIds"),
        status: readLiteral(record, "status", ["finalized"] as const)
      };
    case "device.lost":
      return {
        ...envelope,
        event,
        trackId: readString(record, "trackId"),
        reason: readString(record, "reason")
      };
  }
}
