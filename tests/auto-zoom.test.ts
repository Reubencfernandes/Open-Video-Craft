import { describe, expect, it } from "vitest";

import { collectCaptureInput } from "../src/shared/capture/clicks";
import {
  PROTOCOL_V1_EVENT_NAMES,
  PROTOCOL_V1_INPUT_EVENT_NAMES,
  ProtocolV1Error,
  parseProtocolV1Line
} from "../src/shared/capture/protocol";
import {
  AUTO_ZOOM_HOLD_SECONDS,
  AUTO_ZOOM_LEAD_IN_SECONDS,
  AUTO_ZOOM_LEAD_OUT_SECONDS,
  AUTO_ZOOM_MERGE_GAP_SECONDS,
  AUTO_ZOOM_MIN_DURATION_SECONDS,
  AUTO_ZOOM_SCALE,
  AUTO_ZOOM_SPEED,
  AUTO_ZOOM_TARGET_INSET_PERCENT,
  autoZoomTarget,
  generateAutoZoomEffects,
  type AutoZoomClick,
  type AutoZoomDisplay
} from "../src/shared/editor-domain/auto-zoom";

/** Natural length of one click window: lead-in before the click, tail after it. */
const windowTailSeconds = AUTO_ZOOM_HOLD_SECONDS + AUTO_ZOOM_LEAD_OUT_SECONDS;

const primaryDisplay: AutoZoomDisplay = {
  displayId: "display-1",
  originXPoints: 100,
  originYPoints: 50,
  widthPoints: 1600,
  heightPoints: 900,
  primary: true
};

const secondaryDisplay: AutoZoomDisplay = {
  displayId: "display-2",
  originXPoints: 1700,
  originYPoints: 0,
  widthPoints: 500,
  heightPoints: 500
};

function click(timeSeconds: number, xPoints = 900, yPoints = 500): AutoZoomClick {
  return { timeSeconds, xPoints, yPoints };
}

describe("click-driven automatic zoom", () => {
  it("turns one click into an editable 2x medium zoom on the zoom lane", () => {
    const effects = generateAutoZoomEffects({
      clicks: [click(5)],
      displays: [primaryDisplay],
      durationSeconds: 30
    });

    expect(effects).toHaveLength(1);
    const [effect] = effects;
    expect(effect.id).toBe("auto-zoom-1");
    expect(effect.scale).toBe(AUTO_ZOOM_SCALE);
    expect(effect.speed).toBe(AUTO_ZOOM_SPEED);
    expect(effect.start).toBeCloseTo(5 - AUTO_ZOOM_LEAD_IN_SECONDS, 3);
    expect(effect.end).toBeCloseTo(5 + windowTailSeconds, 3);
    expect(effect.targetX).toBeCloseTo(50, 2);
    expect(effect.targetY).toBeCloseTo(50, 2);
  });

  it("normalizes the click into display-relative percentage coordinates", () => {
    expect(autoZoomTarget({ xPoints: 900, yPoints: 500 }, primaryDisplay)).toEqual({ targetX: 50, targetY: 50 });
    expect(autoZoomTarget({ xPoints: 500, yPoints: 500 }, primaryDisplay)).toEqual({ targetX: 25, targetY: 50 });
    expect(autoZoomTarget({ xPoints: 1300, yPoints: 275 }, primaryDisplay)).toEqual({ targetX: 75, targetY: 25 });
  });

  it("clamps edge clicks so the 2x frame never sits on the screen edge", () => {
    const left = autoZoomTarget({ xPoints: 100, yPoints: 50 }, primaryDisplay);
    const topRight = autoZoomTarget({ xPoints: 1700, yPoints: 950 }, primaryDisplay);
    expect(left).toEqual({ targetX: AUTO_ZOOM_TARGET_INSET_PERCENT, targetY: AUTO_ZOOM_TARGET_INSET_PERCENT });
    expect(topRight).toEqual({
      targetX: 100 - AUTO_ZOOM_TARGET_INSET_PERCENT,
      targetY: 100 - AUTO_ZOOM_TARGET_INSET_PERCENT
    });
  });

  it("merges nearby clicks deterministically into one effect", () => {
    const first = click(5, 500, 500);
    const second = click(5.2, 1300, 500);
    const merged = generateAutoZoomEffects({ clicks: [first, second], displays: [primaryDisplay], durationSeconds: 30 });

    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBeCloseTo(5 - AUTO_ZOOM_LEAD_IN_SECONDS, 3);
    expect(merged[0].end).toBeCloseTo(5.2 + windowTailSeconds, 3);
    expect(merged[0].targetX).toBeCloseTo(50, 2);
    expect(merged[0].targetY).toBeCloseTo(50, 2);

    const shuffled = generateAutoZoomEffects({ clicks: [second, first], displays: [primaryDisplay], durationSeconds: 30 });
    expect(shuffled).toEqual(merged);
    const repeated = generateAutoZoomEffects({ clicks: [first, second], displays: [primaryDisplay], durationSeconds: 30 });
    expect(repeated).toEqual(merged);
  });

  it("keeps every generated effect inside the timeline and non-overlapping", () => {
    const clicks: AutoZoomClick[] = [];
    for (const base of [0.5, 6, 12]) {
      clicks.push(click(base, 100, 400), click(base + 0.5, 900, 500), click(base + 1, 1600, 900));
    }
    const effects = generateAutoZoomEffects({ clicks, displays: [primaryDisplay], durationSeconds: 20 });

    expect(effects).toHaveLength(3);
    expect(effects.map((effect) => effect.id)).toEqual(["auto-zoom-1", "auto-zoom-2", "auto-zoom-3"]);
    for (const effect of effects) {
      expect(effect.start).toBeGreaterThanOrEqual(0);
      expect(effect.end).toBeLessThanOrEqual(20);
      expect(effect.end - effect.start).toBeGreaterThanOrEqual(AUTO_ZOOM_MIN_DURATION_SECONDS - 0.001);
      expect(effect.targetX).toBeGreaterThanOrEqual(AUTO_ZOOM_TARGET_INSET_PERCENT);
      expect(effect.targetX).toBeLessThanOrEqual(100 - AUTO_ZOOM_TARGET_INSET_PERCENT);
      expect(effect.targetY).toBeGreaterThanOrEqual(AUTO_ZOOM_TARGET_INSET_PERCENT);
      expect(effect.targetY).toBeLessThanOrEqual(100 - AUTO_ZOOM_TARGET_INSET_PERCENT);
    }
    for (let index = 1; index < effects.length; index += 1) {
      const gap = effects[index].start - effects[index - 1].end;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeGreaterThanOrEqual(AUTO_ZOOM_MERGE_GAP_SECONDS - 0.002);
    }
  });

  it("stays zoomed while the user keeps clicking instead of overlapping effects", () => {
    const clicks: AutoZoomClick[] = [];
    for (let second = 0; second <= 10; second += 2) {
      clicks.push(click(second, 900, 500));
    }
    const effects = generateAutoZoomEffects({ clicks, displays: [primaryDisplay], durationSeconds: 20 });
    expect(effects).toHaveLength(1);
    expect(effects[0].start).toBe(0);
    expect(effects[0].end).toBeCloseTo(10 + windowTailSeconds, 3);
  });

  it("clips clicks at the timeline edges and drops effects that cannot hold", () => {
    const atStart = generateAutoZoomEffects({
      clicks: [click(0, 900, 500)],
      displays: [primaryDisplay],
      durationSeconds: 5
    });
    expect(atStart).toHaveLength(1);
    expect(atStart[0].start).toBe(0);
    expect(atStart[0].end).toBeCloseTo(windowTailSeconds, 3);

    const nearEnd = generateAutoZoomEffects({
      clicks: [click(4.95, 900, 500)],
      displays: [primaryDisplay],
      durationSeconds: 5
    });
    expect(nearEnd).toHaveLength(1);
    expect(nearEnd[0].start).toBeCloseTo(4.95 - AUTO_ZOOM_LEAD_IN_SECONDS, 3);
    expect(nearEnd[0].end).toBe(5);

    expect(
      generateAutoZoomEffects({ clicks: [click(5.2, 900, 500)], displays: [primaryDisplay], durationSeconds: 5 })
    ).toEqual([]);
    expect(
      generateAutoZoomEffects({ clicks: [click(9, 900, 500)], displays: [primaryDisplay], durationSeconds: 5 })
    ).toEqual([]);
  });

  it("ignores clicks outside the recorded display", () => {
    const displays = [primaryDisplay, secondaryDisplay];
    const clicks = [click(5, 1800, 100), click(10, 900, 500)];

    const restricted = generateAutoZoomEffects({ clicks, displays, durationSeconds: 30, displayId: "display-1" });
    expect(restricted).toHaveLength(1);
    expect(restricted[0].start).toBeCloseTo(10 - AUTO_ZOOM_LEAD_IN_SECONDS, 3);
    expect(restricted[0].targetX).toBeCloseTo(50, 2);

    const resolved = generateAutoZoomEffects({ clicks, displays, durationSeconds: 30 });
    expect(resolved).toHaveLength(2);
    expect(resolved[0].targetX).toBeCloseTo(20, 2);
    expect(resolved[0].targetY).toBeCloseTo(20, 2);
    expect(resolved[1].targetX).toBeCloseTo(50, 2);
  });

  it("returns nothing when there is no display to normalize against", () => {
    expect(generateAutoZoomEffects({ clicks: [click(5)], displays: [], durationSeconds: 30 })).toEqual([]);
    expect(
      generateAutoZoomEffects({ clicks: [click(5)], displays: [primaryDisplay], durationSeconds: 30, displayId: "missing" })
    ).toEqual([]);
    expect(
      generateAutoZoomEffects({
        clicks: [click(5), click(Number.NaN)],
        displays: [primaryDisplay],
        durationSeconds: 30
      })
    ).toHaveLength(1);
  });
});

describe("capture protocol input events", () => {
  const displayLine = JSON.stringify({
    v: 1,
    seq: 1,
    tHostNs: "0",
    event: "display.metrics",
    displayId: "display-1",
    originXPoints: 0,
    originYPoints: 0,
    widthPoints: 1512,
    heightPoints: 982,
    scaleFactor: 2,
    primary: true
  });

  const clickLine = JSON.stringify({
    v: 1,
    seq: 2,
    tHostNs: "7000000000",
    event: "input.click",
    clickIndex: 0,
    clickHostNs: "6900000000",
    button: "left",
    displayId: "display-1",
    xPoints: 900.5,
    yPoints: 500.25
  });

  const permissionLine = JSON.stringify({
    v: 1,
    seq: 3,
    tHostNs: "0",
    event: "input.permission",
    capability: "input-monitoring",
    status: "granted"
  });

  it("declares the input sidecar events next to the mandatory capture events", () => {
    expect([...PROTOCOL_V1_INPUT_EVENT_NAMES]).toEqual(["display.metrics", "input.click", "input.permission"]);
    for (const name of PROTOCOL_V1_INPUT_EVENT_NAMES) {
      expect((PROTOCOL_V1_EVENT_NAMES as readonly string[]).includes(name)).toBe(false);
    }
  });

  it("parses display bounds in points and timestamped global left clicks", () => {
    const display = parseProtocolV1Line(displayLine);
    expect(display).toMatchObject({
      event: "display.metrics",
      displayId: "display-1",
      originXPoints: 0,
      originYPoints: 0,
      widthPoints: 1512,
      heightPoints: 982,
      scaleFactor: 2,
      primary: true
    });

    const clickEvent = parseProtocolV1Line(clickLine);
    expect(clickEvent).toMatchObject({
      event: "input.click",
      clickIndex: 0,
      clickHostNs: "6900000000",
      button: "left",
      displayId: "display-1",
      xPoints: 900.5,
      yPoints: 500.25
    });

    expect(parseProtocolV1Line(permissionLine)).toMatchObject({
      event: "input.permission",
      capability: "input-monitoring",
      status: "granted"
    });
  });

  it("rejects malformed input events instead of guessing", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...JSON.parse(clickLine), clickHostNs: 6900000000 }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(clickLine), button: "right" }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(clickLine), xPoints: "900" }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(clickLine), displayId: undefined }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(displayLine), widthPoints: 0 }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(displayLine), primary: "yes" }, "PROTOCOL_INVALID_FIELD"],
      [{ ...JSON.parse(permissionLine), status: "maybe" }, "PROTOCOL_INVALID_FIELD"]
    ];
    for (const [payload, code] of cases) {
      let thrown: unknown;
      try {
        parseProtocolV1Line(JSON.stringify(payload));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ProtocolV1Error);
      expect((thrown as ProtocolV1Error).code).toBe(code);
    }
  });

  it("collects displays, clicks and the explicit permission state from a sidecar stream", () => {
    const events = [
      parseProtocolV1Line(displayLine),
      parseProtocolV1Line(
        JSON.stringify({
          v: 1,
          seq: 2,
          tHostNs: "0",
          event: "input.permission",
          capability: "input-monitoring",
          status: "denied"
        })
      ),
      parseProtocolV1Line(
        JSON.stringify({
          v: 1,
          seq: 3,
          tHostNs: "0",
          event: "stats",
          elapsedSeconds: 1,
          tracks: [{ trackId: "disp-1", framesWritten: 30, framesDropped: 0 }]
        })
      ),
      parseProtocolV1Line(clickLine),
      parseProtocolV1Line(permissionLine)
    ];

    const snapshot = collectCaptureInput(events);
    expect(snapshot.permission).toBe("granted");
    expect(snapshot.displays).toHaveLength(1);
    expect(snapshot.displays[0]).toMatchObject({ displayId: "display-1", widthPoints: 1512 });
    expect(snapshot.clicks).toHaveLength(1);
    expect(snapshot.clicks[0]).toMatchObject({ clickHostNs: "6900000000", xPoints: 900.5 });
  });

  it("parses a verbatim ovc-click-capture stream", () => {
    // Captured from `ovc-click-capture --duration 0.2` on a two-display Mac.
    const stream = [
      '{"displayId":"1","event":"display.metrics","heightPoints":1440,"originXPoints":0,"originYPoints":0,"primary":true,"scaleFactor":1,"seq":0,"tHostNs":"351779522873791","v":1,"widthPoints":3440}',
      '{"displayId":"3","event":"display.metrics","heightPoints":1080,"originXPoints":-1920,"originYPoints":0,"primary":false,"scaleFactor":1,"seq":1,"tHostNs":"351779522873791","v":1,"widthPoints":1920}',
      '{"capability":"input-monitoring","event":"input.permission","seq":2,"status":"granted","tHostNs":"351779522873791","v":1}'
    ];
    const snapshot = collectCaptureInput(stream.map((line) => parseProtocolV1Line(line)));
    expect(snapshot.permission).toBe("granted");
    expect(snapshot.displays).toHaveLength(2);
    expect(snapshot.clicks).toEqual([]);
    expect(autoZoomTarget({ xPoints: 1720, yPoints: 720 }, snapshot.displays[0])).toEqual({ targetX: 50, targetY: 50 });
  });

  it("feeds captured click lines into the zoom generator through the shared host anchor", () => {
    const events = [parseProtocolV1Line(displayLine), parseProtocolV1Line(clickLine)];
    const snapshot = collectCaptureInput(events);
    const anchorHostNs = 1_000_000_000n;
    const clicks = snapshot.clicks.map((event) => ({
      timeSeconds: Number((BigInt(event.clickHostNs) - anchorHostNs) / 1_000_000_000n)
        + Number((BigInt(event.clickHostNs) - anchorHostNs) % 1_000_000_000n) / 1e9,
      xPoints: event.xPoints,
      yPoints: event.yPoints
    }));

    const effects = generateAutoZoomEffects({
      clicks,
      displays: snapshot.displays,
      durationSeconds: 30,
      displayId: "display-1"
    });
    expect(effects).toHaveLength(1);
    expect(effects[0].start).toBeCloseTo(5.9 - AUTO_ZOOM_LEAD_IN_SECONDS, 3);
    expect(effects[0].targetX).toBeCloseTo(59.56, 2);
    expect(effects[0].targetY).toBeCloseTo(50.94, 2);
  });
});
