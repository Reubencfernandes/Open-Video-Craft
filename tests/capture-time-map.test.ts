import { describe, expect, it } from "vitest";
import {
  TICKS_PER_SECOND,
  divRound,
  hostNsToTicks,
  microsToTicks,
  ticksToMicros
} from "../src/shared/time/ticks";
import { HostNsParseError, parseHostNs, serializeHostNs } from "../src/shared/time/host-ns";
import {
  TIMEMAP_OVERLAP,
  assertTimeMapValid,
  mapCaptureToSource,
  mapSourceToCapture,
  validateTimeMap,
  type TimeMap
} from "../src/shared/time/time-map";
import {
  ManifestError,
  manifestToCaptureSession,
  manifestToTimeMap,
  type CaptureManifestV1
} from "../src/shared/capture/manifest";

describe("tick arithmetic (DATA_MODEL §2 boundaries 1, 3 and 3b)", () => {
  it("rounds every division half toward +infinity", () => {
    expect(divRound(1n, 2n)).toBe(1n);
    expect(divRound(-1n, 2n)).toBe(0n);
    expect(divRound(3n, 2n)).toBe(2n);
    expect(divRound(-3n, 2n)).toBe(-1n);
    expect(divRound(7n, 3n)).toBe(2n);
    expect(divRound(-7n, 3n)).toBe(-2n);
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
    expect(() => divRound(1n, -2n)).toThrow(RangeError);
  });

  it("converts HostNs to ticks with the exact 441/625 formula", () => {
    expect(hostNsToTicks(0n)).toBe(0n);
    expect(hostNsToTicks(1n)).toBe(1n);
    expect(hostNsToTicks(2n)).toBe(1n);
    expect(hostNsToTicks(1_000_000_000n)).toBe(TICKS_PER_SECOND);
    expect(hostNsToTicks(1_000_000_000n)).toBe(705_600_000n);
    expect(hostNsToTicks(-1_000_000_000n)).toBe(-TICKS_PER_SECOND);
  });

  it("converts ticks to micros and back within half a microsecond", () => {
    expect(ticksToMicros(TICKS_PER_SECOND)).toBe(1_000_000n);
    expect(ticksToMicros(0n)).toBe(0n);
    expect(ticksToMicros(23_543_520n)).toBe(33_367n);
    expect(microsToTicks(1_000_000n)).toBe(TICKS_PER_SECOND);
    for (const ticks of [1n, 1_234_567n, 2_540_160_000_000n, -987_654_321n]) {
      const roundTrip = microsToTicks(ticksToMicros(ticks));
      const error = roundTrip > ticks ? roundTrip - ticks : ticks - roundTrip;
      expect(error <= 353n).toBe(true);
    }
  });
});

describe("HostNs decimal strings (DATA_MODEL §5)", () => {
  it("round-trips values that exceed the safe integer range", () => {
    const values = ["0", "123456789000", "9007199254740993", "18446744073709551615"];
    for (const value of values) {
      const parsed = parseHostNs(value);
      expect(typeof parsed).toBe("bigint");
      expect(serializeHostNs(parsed)).toBe(value);
      expect(parsed > BigInt(Number.MAX_SAFE_INTEGER)).toBe(value.length >= 16);
    }
  });

  it("rejects strings that are not plain decimal integers", () => {
    for (const value of ["", " 1", "1 ", "1.0", "1e9", "+1", "0x10", "abc", "1_000", "Infinity"]) {
      expect(() => parseHostNs(value)).toThrow(HostNsParseError);
    }
  });

  it("serializes bigint ticks without a numeric conversion", () => {
    expect(serializeHostNs(9_007_199_254_740_993n)).toBe("9007199254740993");
    expect(serializeHostNs(-5n)).toBe("-5");
  });
});

describe("TimeMap mapping (DATA_MODEL §6.3)", () => {
  const baseMap: TimeMap = {
    segments: [
      { sourceStartTicks: 0n, sourceDurationTicks: 7_056_000n, captureStartTicks: 12n, rateppm: 0 },
      { sourceStartTicks: 7_668_000n, sourceDurationTicks: 7_056_000n, captureStartTicks: 7_080_000n, rateppm: 0 }
    ],
    calibrationOffsetTicks: 0n
  };

  it("maps a source tick to the capture axis with start offset, jump and calibration", () => {
    expect(validateTimeMap(baseMap)).toEqual([]);
    expect(mapSourceToCapture(baseMap, 0n)).toBe(12n);
    expect(mapSourceToCapture(baseMap, 3_528_000n)).toBe(3_528_012n);
    // Half-open: the first tick of segment 1 belongs to segment 2.
    expect(mapSourceToCapture(baseMap, 7_056_000n)).toBeUndefined();
    expect(mapSourceToCapture(baseMap, 7_668_000n)).toBe(7_080_000n);
    const calibrated: TimeMap = { ...baseMap, calibrationOffsetTicks: -2_500n };
    expect(mapSourceToCapture(calibrated, 0n)).toBe(-2_488n);
    expect(mapSourceToCapture(calibrated, 7_668_000n)).toBe(7_077_500n);
  });

  it("applies calibration last, never inside the segment interpolation", () => {
    const map: TimeMap = {
      segments: [{ sourceStartTicks: 1_000n, sourceDurationTicks: 5_000n, captureStartTicks: 40n, rateppm: 0 }],
      calibrationOffsetTicks: 900n
    };
    expect(mapSourceToCapture(map, 1_000n)).toBe(940n);
    expect(mapSourceToCapture(map, 6_000n)).toBeUndefined();
    expect(mapSourceToCapture(map, 999n)).toBeUndefined();
    const duration = 5_000;
    const shifted: TimeMap = { ...map, calibrationOffsetTicks: 0n };
    for (let delta = 0; delta < duration; delta += 1) {
      const withCalibration = mapSourceToCapture(map, 1_000n + BigInt(delta));
      const withoutCalibration = mapSourceToCapture(shifted, 1_000n + BigInt(delta));
      expect(withCalibration).toBe(withoutCalibration! + 900n);
    }
  });

  it("is strictly increasing inside a segment and inverses within one tick", () => {
    const map: TimeMap = {
      segments: [{ sourceStartTicks: 200n, sourceDurationTicks: 70_560_000n, captureStartTicks: 16n, rateppm: 0 }],
      calibrationOffsetTicks: 33n
    };
    let previous: bigint | undefined;
    for (let step = 0n; step < 10_000n; step += 1n) {
      const mapped = mapSourceToCapture(map, 200n + step * 7_056n);
      expect(mapped).toBeDefined();
      if (previous !== undefined) expect(mapped! > previous).toBe(true);
      previous = mapped;
      const back = mapCaptureToSource(map, mapped!);
      expect(back).toBeDefined();
      const error = back! > 200n + step * 7_056n ? back! - (200n + step * 7_056n) : 200n + step * 7_056n - back!;
      expect(error <= 1n).toBe(true);
    }
  });

  it("reports gaps on both axes instead of holding", () => {
    const map: TimeMap = {
      segments: [
        { sourceStartTicks: 0n, sourceDurationTicks: 1_000n, captureStartTicks: 0n, rateppm: 0 },
        { sourceStartTicks: 10_000n, sourceDurationTicks: 1_000n, captureStartTicks: 40_000n, rateppm: 0 }
      ],
      calibrationOffsetTicks: 0n
    };
    expect(validateTimeMap(map)).toEqual([]);
    expect(mapSourceToCapture(map, 4_999n)).toBeUndefined();
    expect(mapCaptureToSource(map, 20_000n)).toBeUndefined();
    expect(mapCaptureToSource(map, -1n)).toBeUndefined();
    expect(mapCaptureToSource(map, 40_000n)).toBe(10_000n);
    expect(mapCaptureToSource(map, 41_000n)).toBeUndefined();
  });

  it("rejects overlapping and unsorted segments", () => {
    const overlapping: TimeMap = {
      segments: [
        { sourceStartTicks: 0n, sourceDurationTicks: 1_000n, captureStartTicks: 0n, rateppm: 0 },
        { sourceStartTicks: 500n, sourceDurationTicks: 1_000n, captureStartTicks: 1_000n, rateppm: 0 }
      ],
      calibrationOffsetTicks: 0n
    };
    expect(validateTimeMap(overlapping).map((issue) => issue.code)).toEqual(["TIMEMAP_OVERLAP"]);
    const unsorted: TimeMap = {
      segments: [overlapping.segments[1], overlapping.segments[0]],
      calibrationOffsetTicks: 0n
    };
    expect(validateTimeMap(unsorted).map((issue) => issue.code)).toContain("TIMEMAP_UNSORTED");
    expect(() => assertTimeMapValid(overlapping)).toThrowError(TIMEMAP_OVERLAP);
  });

  it("keeps rateppm at zero until G1 measures drift", () => {
    const drifting: TimeMap = {
      segments: [{ sourceStartTicks: 0n, sourceDurationTicks: 1_000n, captureStartTicks: 0n, rateppm: 20 }],
      calibrationOffsetTicks: 0n
    };
    expect(validateTimeMap(drifting).map((issue) => issue.code)).toEqual(["TIMEMAP_RATE_UNMEASURED"]);
    const outOfRange: TimeMap = {
      segments: [{ sourceStartTicks: 0n, sourceDurationTicks: 1_000n, captureStartTicks: 0n, rateppm: 20_000 }],
      calibrationOffsetTicks: 0n
    };
    expect(validateTimeMap(outOfRange).map((issue) => issue.code)).toContain("TIMEMAP_RATE_OUT_OF_RANGE");
    expect(validateTimeMap({ segments: [], calibrationOffsetTicks: 0n }).map((issue) => issue.code)).toEqual([
      "TIMEMAP_EMPTY"
    ]);
  });
});

const hostNsOf = (seconds: number): string => BigInt(Math.round(seconds * 1_000_000_000)).toString();
const ticksOf = (seconds: number): bigint => hostNsToTicks(BigInt(Math.round(seconds * 1_000_000_000)));

function createManifest(options: {
  anchorSeconds: number;
  trackFirstSeconds: number;
  trackLastSeconds: number;
  pauses?: readonly { startSeconds: number; endSeconds: number }[];
  rollovers?: readonly number[];
  endedAtSeconds?: number;
}): CaptureManifestV1 {
  const pauses = (options.pauses ?? []).map((pause, index) => ({
    pauseId: `pause-${index + 1}`,
    startHostNs: hostNsOf(pause.startSeconds),
    endHostNs: hostNsOf(pause.endSeconds)
  }));
  const rollovers = options.rollovers ?? [];
  const trackFiles = [
    { file: "disp-1.mov", firstPtsHostNs: hostNsOf(options.trackFirstSeconds) },
    ...rollovers.map((seconds, index) => ({
      file: `disp-1-${index + 2}.mov`,
      firstPtsHostNs: hostNsOf(seconds)
    }))
  ];
  const endedAt = options.endedAtSeconds;
  return {
    manifestVersion: 1,
    sessionId: "session-fixture",
    engine: "native",
    clockDomain: "host",
    hostClock: { timebaseNumer: 125, timebaseDenom: 3 },
    anchorHostNs: hostNsOf(options.anchorSeconds),
    pauses,
    tracks: [
      {
        trackId: "disp-1",
        kind: "display",
        deviceId: "display-1",
        file: "disp-1.mov",
        codec: "hevc",
        width: 3440,
        height: 1440,
        fps: 30,
        sampleRate: null,
        channels: null,
        firstPtsHostNs: hostNsOf(options.trackFirstSeconds),
        lastPtsHostNs: hostNsOf(options.trackLastSeconds),
        framesWritten: 150,
        framesDropped: 0,
        segments: trackFiles,
        status: "finalized"
      }
    ],
    status: "finalized",
    ...(endedAt === undefined ? {} : { endedAtHostNs: hostNsOf(endedAt) })
  };
}

describe("manifest conversion (DATA_MODEL §5 and §6.3)", () => {
  it("converts manifest pauses once onto the capture axis, owned by CaptureSession", () => {
    const manifest = createManifest({
      anchorSeconds: 1.5,
      trackFirstSeconds: 2,
      trackLastSeconds: 10,
      pauses: [{ startSeconds: 5, endSeconds: 7 }],
      endedAtSeconds: 10
    });
    const session = manifestToCaptureSession(manifest);
    expect(session.id).toBe("session-fixture");
    expect(session.engine).toBe("native");
    expect(session.pauses).toEqual([{ startTicks: ticksOf(3.5), endTicks: ticksOf(5.5) }]);
    expect(session.endedAtTicks).toBe(ticksOf(8.5));
    expect(Object.keys(manifestToTimeMap(manifest, "disp-1"))).not.toContain("pauses");
  });

  it("derives one segment per recorded piece and leaves a gap on the paused range", () => {
    const manifest = createManifest({
      anchorSeconds: 1.5,
      trackFirstSeconds: 2,
      trackLastSeconds: 10,
      pauses: [{ startSeconds: 5, endSeconds: 7 }]
    });
    const map = manifestToTimeMap(manifest, "disp-1");
    expect(validateTimeMap(map)).toEqual([]);
    expect(map.calibrationOffsetTicks).toBe(0n);
    expect(map.segments).toEqual([
      { sourceStartTicks: 0n, sourceDurationTicks: ticksOf(3), captureStartTicks: ticksOf(0.5), rateppm: 0 },
      {
        sourceStartTicks: ticksOf(3),
        sourceDurationTicks: ticksOf(3),
        captureStartTicks: ticksOf(5.5),
        rateppm: 0
      }
    ]);
    expect(mapSourceToCapture(map, 0n)).toBe(ticksOf(0.5));
    expect(mapCaptureToSource(map, ticksOf(2))).toBe(ticksOf(1.5));
    expect(mapCaptureToSource(map, ticksOf(4.5))).toBeUndefined();
    expect(mapCaptureToSource(map, ticksOf(6.25))).toBe(ticksOf(3.75));
  });

  it("keeps pause/resume free of cumulative offset after ten pauses (T9)", () => {
    const pauses = Array.from({ length: 10 }, (_unused, index) => ({
      startSeconds: 103 + index * 4,
      endSeconds: 104 + index * 4
    }));
    const manifest = createManifest({
      anchorSeconds: 100,
      trackFirstSeconds: 100.25,
      trackLastSeconds: 142.5,
      pauses
    });
    const map = manifestToTimeMap(manifest, "disp-1");
    expect(validateTimeMap(map)).toEqual([]);
    const recordedTicks = 32.25;
    let expectedSource = 0n;
    for (const segment of map.segments) {
      expect(segment.sourceStartTicks).toBe(expectedSource);
      expectedSource += segment.sourceDurationTicks;
    }
    expect(expectedSource).toBe(ticksOf(recordedTicks));
    const captureStart = mapSourceToCapture(map, 0n);
    expect(captureStart).toBe(ticksOf(0.25));
    expect(mapCaptureToSource(map, captureStart!)).toBe(0n);
    // Every pause/resume pair round-trips exactly: no cumulative offset (T9).
    for (const segment of map.segments) {
      const lastSource = segment.sourceStartTicks + segment.sourceDurationTicks - 1n;
      const mapped = mapSourceToCapture(map, lastSource);
      expect(mapped).toBeDefined();
      expect(mapCaptureToSource(map, mapped!)).toBe(lastSource);
    }
    expect(map.segments[1].captureStartTicks).toBe(ticksOf(4));
  });

  it("starts a rolled-over file at its own first PTS and rejects an overlapping rollover", () => {
    const manifest = createManifest({
      anchorSeconds: 1,
      trackFirstSeconds: 1,
      trackLastSeconds: 30,
      rollovers: [10]
    });
    const first = manifestToTimeMap(manifest, "disp-1", 0);
    expect(first.segments).toHaveLength(1);
    expect(first.segments[0].captureStartTicks).toBe(0n);
    expect(first.segments[0].sourceDurationTicks).toBe(ticksOf(9));
    const second = manifestToTimeMap(manifest, "disp-1", 1);
    expect(second.segments[0].captureStartTicks).toBe(ticksOf(9));
    expect(second.segments[0].sourceDurationTicks).toBe(ticksOf(20));

    const overlapping = createManifest({
      anchorSeconds: 1,
      trackFirstSeconds: 1,
      trackLastSeconds: 30,
      rollovers: [30, 10]
    });
    expect(() => manifestToTimeMap(overlapping, "disp-1", 1)).toThrowError(TIMEMAP_OVERLAP);
  });

  it("rejects an unknown track instead of guessing", () => {
    const manifest = createManifest({ anchorSeconds: 0, trackFirstSeconds: 0, trackLastSeconds: 1 });
    expect(() => manifestToTimeMap(manifest, "camera-9")).toThrowError(ManifestError);
  });
});
