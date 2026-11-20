import { describe, expect, it } from "vitest";
import {
  PROTOCOL_V1_EVENT_NAMES,
  ProtocolV1Error,
  parseProtocolV1Line
} from "../src/shared/capture/protocol";

const lines: Record<string, string> = {
  "session.start": JSON.stringify({
    v: 1,
    seq: 0,
    tHostNs: "0",
    event: "session.start",
    sessionId: "dry-run-session",
    engine: "native",
    clockDomain: "host",
    anchorHostNs: "0",
    mode: "dry-run",
    codec: "hevc",
    fps: 30,
    durationSeconds: 5,
    out: "/tmp/ovc-g1"
  }),
  devices: JSON.stringify({
    v: 1,
    seq: 1,
    tHostNs: "0",
    event: "devices",
    displays: ["dry-display-1"],
    cameras: ["dry-camera-1"],
    microphones: ["dry-mic-1"],
    systemAudio: "sck",
    source: "dry-run"
  }),
  stats: JSON.stringify({
    v: 1,
    seq: 2,
    tHostNs: "1000000000",
    event: "stats",
    elapsedSeconds: 1,
    tracks: [{ trackId: "disp-1", framesWritten: 30, framesDropped: 0 }]
  }),
  "track.first_pts": JSON.stringify({
    v: 1,
    seq: 3,
    tHostNs: "12000000",
    event: "track.first_pts",
    trackId: "disp-1",
    firstPtsHostNs: "12000000"
  }),
  pauses: JSON.stringify({
    v: 1,
    seq: 4,
    tHostNs: "2000000000",
    event: "pauses",
    pauseIndex: 0,
    startHostNs: "3000000000",
    endHostNs: "4000000000"
  }),
  "track.finalized": JSON.stringify({
    v: 1,
    seq: 5,
    tHostNs: "5000000000",
    event: "track.finalized",
    trackId: "disp-1",
    file: "disp-1.mov",
    firstPtsHostNs: "12000000",
    lastPtsHostNs: "4120000000",
    framesWritten: 150,
    framesDropped: 0,
    segments: [{ file: "disp-1.mov", firstPtsHostNs: "12000000" }],
    status: "finalized"
  }),
  "session.finalized": JSON.stringify({
    v: 1,
    seq: 6,
    tHostNs: "5000000000",
    event: "session.finalized",
    sessionId: "dry-run-session",
    endedAtHostNs: "4120000000",
    manifestPath: "/tmp/ovc-g1/capture-session.json",
    trackIds: ["disp-1"],
    status: "finalized"
  }),
  "device.lost": JSON.stringify({
    v: 1,
    seq: 7,
    tHostNs: "6000000000",
    event: "device.lost",
    trackId: "cam-1",
    reason: "AVCaptureSessionRuntimeError"
  })
};

describe("protocol v1 parser", () => {
  it("accepts every protocol v1 event of the deterministic dry run", () => {
    for (const [name, line] of Object.entries(lines)) {
      const event = parseProtocolV1Line(line);
      expect(event.event).toBe(name);
      expect(event.v).toBe(1);
      expect(Number.isInteger(event.seq)).toBe(true);
      expect(event.tHostNs).toMatch(/^-?\d+$/);
    }
    expect([...PROTOCOL_V1_EVENT_NAMES].sort()).toEqual(Object.keys(lines).sort());
  });

  it("keeps HostNs decimal strings, never numbers", () => {
    const event = parseProtocolV1Line(lines["track.first_pts"]);
    expect(event.event).toBe("track.first_pts");
    if (event.event !== "track.first_pts") throw new Error("unreachable");
    expect(event.firstPtsHostNs).toBe("12000000");
    const numeric = JSON.parse(lines["track.first_pts"].replace('"12000000"', "12000000")) as unknown;
    expect(() => parseProtocolV1Line(JSON.stringify(numeric))).toThrow(ProtocolV1Error);
  });

  it("rejects malformed lines with a coded error", () => {
    const cases: [string, string][] = [
      ["not json", "PROTOCOL_INVALID_JSON"],
      ["[]", "PROTOCOL_INVALID_JSON"],
      ['{"v":2,"seq":0,"tHostNs":"0","event":"session.start"}', "PROTOCOL_INVALID_EVENT"],
      ['{"v":1,"seq":0,"tHostNs":"0","event":"session.unknown"}', "PROTOCOL_INVALID_EVENT"],
      ['{"v":1,"seq":-1,"tHostNs":"0","event":"session.start"}', "PROTOCOL_INVALID_FIELD"],
      ['{"v":1,"seq":1.5,"tHostNs":"0","event":"session.start"}', "PROTOCOL_INVALID_FIELD"],
      ['{"v":1,"seq":0,"event":"session.start"}', "PROTOCOL_INVALID_FIELD"]
    ];
    for (const [line, code] of cases) {
      let thrown: unknown;
      try {
        parseProtocolV1Line(line);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ProtocolV1Error);
      expect((thrown as ProtocolV1Error).code).toBe(code);
    }
  });

  it("rejects an event that misses a field its name requires", () => {
    const missingTrackId = JSON.stringify({
      v: 1,
      seq: 3,
      tHostNs: "12000000",
      event: "track.first_pts",
      firstPtsHostNs: "12000000"
    });
    expect(() => parseProtocolV1Line(missingTrackId)).toThrowError(/PROTOCOL_INVALID_FIELD/);
    const missingTracks = JSON.stringify({ v: 1, seq: 2, tHostNs: "0", event: "stats", elapsedSeconds: 1 });
    expect(() => parseProtocolV1Line(missingTracks)).toThrowError(/PROTOCOL_INVALID_FIELD/);
  });
});
