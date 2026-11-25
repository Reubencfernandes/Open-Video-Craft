import { describe, expect, it } from "vitest";

import { readClickCapture, maxRecordedClicks } from "../src/main/click-capture";
import { generateAutoZoomEffects } from "../src/shared/editor-domain/auto-zoom";

const metrics = (seq: number, hostNs: string, displayId: string, primary: boolean) =>
  JSON.stringify({
    v: 1,
    seq,
    tHostNs: hostNs,
    event: "display.metrics",
    displayId,
    originXPoints: primary ? 0 : 1720,
    originYPoints: 0,
    widthPoints: 1720,
    heightPoints: 1080,
    scaleFactor: 2,
    primary
  });

const click = (seq: number, hostNs: string, displayId: string, x: number, y: number, index: number) =>
  JSON.stringify({
    v: 1,
    seq,
    tHostNs: hostNs,
    event: "input.click",
    clickIndex: index,
    clickHostNs: hostNs,
    button: "left",
    displayId,
    xPoints: x,
    yPoints: y
  });

describe("click capture reading", () => {
  it("converts host timestamps into timeline seconds measured from the first event", () => {
    const jsonl = [
      metrics(1, "1000000000", "primary", true),
      metrics(2, "1000000000", "secondary", false),
      click(3, "5000000000", "primary", 400, 300, 0),
      click(4, "7300000000", "primary", 900, 700, 1)
    ].join("\n");

    const data = readClickCapture(jsonl, "primary");

    expect(data.displays).toHaveLength(2);
    expect(data.clicks.map((entry) => entry.timeSeconds)).toEqual([4, 6.3]);
    expect(data.clicks[0]?.xPoints).toBe(400);
    expect(data.displayId).toBe("primary");
  });

  it("keeps clicks from other displays and the clicks that follow a truncated line", () => {
    const jsonl = [
      metrics(1, "0", "primary", true),
      metrics(2, "0", "secondary", false),
      click(3, "2000000000", "secondary", 2000, 100, 0),
      click(4, "9000000000", "primary", 100, 100, 1),
      '{"v":1,"seq":5,"event":"input.cl'
    ].join("\n");

    const data = readClickCapture(jsonl, "primary");

    expect(data.clicks).toHaveLength(2);
    expect(data.clicks[1]?.timeSeconds).toBe(9);
  });

  it("falls back to the only reported display when no id is given", () => {
    const jsonl = [metrics(1, "0", "only-display", true)].join("\n");
    expect(readClickCapture(jsonl).displayId).toBe("only-display");
  });

  it("returns an empty capture for a session without events", () => {
    const data = readClickCapture("");
    expect(data.clicks).toEqual([]);
    expect(data.displays).toEqual([]);
    expect(data.displayId).toBeNull();
  });

  it("never stores more clicks than the bound allows", () => {
    const lines = [metrics(1, "0", "primary", true)];
    for (let index = 0; index < maxRecordedClicks + 25; index += 1) {
      lines.push(click(index + 2, String(1_000_000_000 + index * 1_000_000), "primary", 10, 10, index));
    }

    expect(readClickCapture(lines.join("\n"), "primary").clicks).toHaveLength(maxRecordedClicks);
  });
});

describe("click capture feeds the auto zoom generator", () => {
  it("produces editable 2x zoom effects for the recorded display only", () => {
    const jsonl = [
      metrics(1, "0", "primary", true),
      metrics(2, "0", "secondary", false),
      click(3, "3000000000", "primary", 400, 300, 0),
      click(4, "4000000000", "secondary", 2000, 300, 1)
    ].join("\n");

    const capture = readClickCapture(jsonl, "primary");
    const effects = generateAutoZoomEffects({
      clicks: capture.clicks,
      displays: capture.displays,
      durationSeconds: 20,
      displayId: capture.displayId ?? undefined
    });

    expect(effects).toHaveLength(1);
    expect(effects[0]?.scale).toBe(2);
    expect(effects[0]?.start).toBeGreaterThanOrEqual(0);
    expect(effects[0]?.end).toBeLessThanOrEqual(20);
  });
});
