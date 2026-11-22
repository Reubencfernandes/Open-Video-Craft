import { describe, expect, it } from "vitest";
import {
  applyEditorOperations,
  createDefaultEditorState,
  getEffectiveAudioLevel,
  validateEditorStateSnapshot
} from "../src/shared/editor-domain";

describe("audio clip fades", () => {
  it("resolves fade durations from persisted audio levels", () => {
    const level = getEffectiveAudioLevel(
      { music: { volume: 80, muted: false, fadeIn: 1.5, fadeOut: 2 } },
      "music",
      0
    );
    expect(level).toMatchObject({ volume: 80, muted: false, fadeIn: 1.5, fadeOut: 2 });
  });

  it("defaults fades to zero for legacy levels", () => {
    expect(getEffectiveAudioLevel({ music: { volume: 100, muted: false } }, "music"))
      .toMatchObject({ fadeIn: 0, fadeOut: 0 });
  });

  it("keeps fade values when an audio gain operation updates the same item", () => {
    const state = createDefaultEditorState();
    state.audioLevels = { music: { volume: 100, muted: false, fadeIn: 1, fadeOut: 2 } };
    const result = applyEditorOperations(state, [
      { type: "set_audio", itemId: "music", gainDb: -6, muted: false }
    ]);
    expect(result.state.audioLevels.music).toMatchObject({ fadeIn: 1, fadeOut: 2 });
    expect(validateEditorStateSnapshot(result.state)).toBe(true);
  });
});
