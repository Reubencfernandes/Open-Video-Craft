import { describe, expect, it } from "vitest";
import {
  dbToLinearPercent,
  formatPeakDbfs,
  linearPercentToDb,
  peakToDbfs,
  peakToMeterPercent
} from "../src/renderer/editor/audio-utils";

describe("audio dB conversion and metering", () => {
  it("round-trips unity and positive gain", () => {
    expect(linearPercentToDb(100)).toBe(0);
    expect(dbToLinearPercent(12)).toBe(398);
    expect(linearPercentToDb(dbToLinearPercent(12))).toBeCloseTo(12, 1);
  });

  it("maps peak amplitude logarithmically onto the meter", () => {
    expect(peakToDbfs(1)).toBe(0);
    expect(peakToDbfs(0.25)).toBeCloseTo(-12.04, 1);
    expect(peakToMeterPercent(0)).toBe(0);
    expect(peakToMeterPercent(1)).toBe(100);
    expect(peakToMeterPercent(0.25)).toBeCloseTo(80, 0);
  });

  it("preserves over-range clipping in the dB readout", () => {
    expect(peakToDbfs(2)).toBeCloseTo(6.02, 1);
    expect(formatPeakDbfs(2)).toBe("+6.0 dBFS");
    expect(peakToMeterPercent(2)).toBe(100);
  });
});
