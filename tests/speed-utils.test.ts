import { describe, expect, it } from "vitest";
import { getActiveSpeedRate, isSpeedRate } from "../src/renderer/editor/speed-utils";

const effects = [
  { id: "speed-1", start: 1, end: 3, rate: 2 as const },
  { id: "speed-2", start: 5, end: 6, rate: 5 as const }
];

describe("speed utils", () => {
  it("returns 1x outside speed effects and the effect rate inside a range", () => {
    expect(getActiveSpeedRate(effects, 0.9)).toBe(1);
    expect(getActiveSpeedRate(effects, 1)).toBe(2);
    expect(getActiveSpeedRate(effects, 2.5)).toBe(2);
    expect(getActiveSpeedRate(effects, 3)).toBe(1);
    expect(getActiveSpeedRate(effects, 5.25)).toBe(5);
  });

  it("validates supported speed rates", () => {
    expect(isSpeedRate(1)).toBe(true);
    expect(isSpeedRate(5)).toBe(true);
    expect(isSpeedRate(6)).toBe(false);
  });
});
