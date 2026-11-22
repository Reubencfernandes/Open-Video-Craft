import { describe, expect, it } from "vitest";

import {
  AUDIO_CLEANUP_PRESETS,
  buildAudioCleanupFilter,
  normalizeAudioCleanupSettings
} from "../src/shared/editor-domain/audio-cleanup";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";
import { createDefaultEditorState, validateEditorStateSnapshot } from "../src/shared/editor-domain/schema";
import { applyEditorOperations } from "../src/shared/editor-domain/operations";

describe("audio cleanup", () => {
  it("builds a neural wind filter driven by the bundled RNNoise model", () => {
    const filter = buildAudioCleanupFilter(
      { preset: "wind", strength: 50 },
      "/Models/lq.rnnn"
    );
    expect(filter).toContain("highpass=f=170");
    expect(filter).toContain("arnndn=m='/Models/lq.rnnn':mix=1");
    expect(filter).toContain("volume=1.22");
    expect(filter).not.toContain("acompressor");
    expect(filter).not.toContain("afftdn");
    expect(filter).not.toContain("anlmdn");
    expect(filter).not.toContain("lowpass");
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
