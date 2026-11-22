import { describe, expect, it } from "vitest";
import { getPlaybackRateForTrack } from "../src/renderer/editor/speed-utils";

import { createDefaultEditorState, validateEditorStateSnapshot } from "../src/shared/editor-domain/schema";
import { applyEditorOperations } from "../src/shared/editor-domain/operations";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";
import { getActiveSpeedRate, isSpeedRate, speedRates } from "../src/renderer/editor/speed-utils";

describe("fractional speed rates", () => {
  it("accepts 1.25x and 1.5x across the shared rate registry", () => {
    expect(speedRates).toContain(1.25);
    expect(speedRates).toContain(1.5);
    expect(isSpeedRate(1.25)).toBe(true);
    expect(isSpeedRate(1.5)).toBe(true);
    expect(isSpeedRate(1.75)).toBe(false);
  });

  it("accepts MCP set_speed operations with fractional rates", () => {
    expect(() => operationSchema.parse({
      type: "set_speed", id: "speed-1", start: 0, end: 5, rate: 1.5
    })).not.toThrow();
  });

  it("persists and resolves fractional speed effects", () => {
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [
        { id: "video", itemId: "screen", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }
      ],
      trimRange: { start: 0, end: 10 }
    };
    const result = applyEditorOperations(state, [
      { type: "set_speed", id: "speed-1", start: 0, end: 10, rate: 1.25 }
    ]);
    expect(result.state.speedEffects[0]?.rate).toBe(1.25);
    expect(validateEditorStateSnapshot(result.state)).toBe(true);
    expect(getActiveSpeedRate(result.state.speedEffects, 3)).toBe(1.25);
  });
});


describe("playback speed scope", () => {
  it("never speeds up audio-track clips", () => {
    const effects = [{ id: "s", start: 0, end: 5, rate: 3 as const }];
    expect(getPlaybackRateForTrack("audio", effects, 1)).toBe(1);
    expect(getPlaybackRateForTrack("video", effects, 1)).toBe(3);
  });
});
