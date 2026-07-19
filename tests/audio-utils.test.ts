import { describe, expect, it } from "vitest";
import { getAudioLaneLevelKey, getEffectiveAudioLevel } from "../src/shared/editor-domain";
import { collectSpeechSources } from "../src/renderer/editor/useSubtitleGeneration";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";
import {
  dbToLinearPercent,
  formatPeakDbfs,
  linearPercentToDb,
  peakToDbfs,
  peakToMeterPercent
} from "../src/renderer/editor/audio-utils";

describe("audio dB conversion and metering", () => {
  it("combines source gain with a persisted lane mute without muting other lanes", () => {
    const levels = {
      voice: { volume: 80, muted: false },
      [getAudioLaneLevelKey(2)]: { volume: 100, muted: true }
    };

    expect(getEffectiveAudioLevel(levels, "voice", 2)).toEqual({
      volume: 80,
      muted: true
    });
    expect(getEffectiveAudioLevel(levels, "voice", 1)).toEqual({
      volume: 80,
      muted: false
    });
  });

  it("excludes only the muted lane when preparing reused audio for subtitles", () => {
    const item: EditorMediaItem = {
      id: "voice",
      name: "Voice",
      url: "ovc-import://voice",
      kind: "audio",
      origin: "imported",
      track: "imported",
      duration: 10
    };
    const clip = (id: string, lane: number, start: number): TimelineMediaClip => ({
      id,
      item,
      track: "audio",
      lane,
      start,
      duration: 2,
      sourceStart: 0
    });

    const sources = collectSpeechSources({
      audioClips: [clip("muted-copy", 0, 0), clip("audible-copy", 1, 4)],
      videoClips: [],
      audioLevels: { "audio-lane:0": { volume: 100, muted: true } },
      backgroundAudioIds: []
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ timelineOffset: 4, gain: 1 });
  });

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
