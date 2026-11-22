import { describe, expect, it } from "vitest";

import {
  AUDIO_CLEANUP_PRESETS,
  buildAudioCleanupFilter,
  getAudioCleanupPreviewSettings,
  normalizeAudioCleanupSettings
} from "../src/shared/editor-domain/audio-cleanup";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";
import { createDefaultEditorState, validateEditorStateSnapshot } from "../src/shared/editor-domain/schema";
import { applyEditorOperations } from "../src/shared/editor-domain/operations";

describe("audio cleanup", () => {
  it("builds a speech-preserving wind filter without aggressive FFT denoise", () => {
    const filter = buildAudioCleanupFilter({ preset: "wind", strength: 50 });
    expect(filter).toContain("highpass=f=80");
    expect(filter).toContain("lowshelf=f=200:g=-4");
    expect(filter).toContain("anlmdn=s=1.1:r=0.01");
    expect(filter).not.toContain("afftdn");
    expect(filter).not.toContain("lowpass");
  });

  it("maps cleanup settings to preview filter parameters", () => {
    expect(getAudioCleanupPreviewSettings({ preset: "wind", strength: 50 })).toEqual({
      highpassHz: 80,
      lowShelfHz: 200,
      lowShelfGainDb: -4,
      noiseStrength: 1.1
    });
    expect(getAudioCleanupPreviewSettings({ preset: "wind", strength: 0 })).toBeNull();
  });

  it("offers distinct presets and clamps strength", () => {
    expect(AUDIO_CLEANUP_PRESETS).toEqual(["wind", "room", "steady"]);
    expect(normalizeAudioCleanupSettings({ preset: "wind", strength: 999 }).strength).toBe(100);
    expect(normalizeAudioCleanupSettings({ preset: "wind", strength: -5 }).strength).toBe(0);
  });

  it("accepts the MCP operation and persists cleanup settings", () => {
    const operation = {
      type: "set_audio_cleanup",
      itemId: "mic",
      preset: "wind",
      strength: 60
    };
    expect(() => operationSchema.parse(operation)).not.toThrow();

    const result = applyEditorOperations(createDefaultEditorState(), [operation]);
    expect(result.state.audioCleanup).toMatchObject({
      mic: { preset: "wind", strength: 60 }
    });
    expect(validateEditorStateSnapshot(result.state)).toBe(true);
  });
});
