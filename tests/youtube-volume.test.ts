import { describe, expect, it } from "vitest";
import {
  applyEditorOperations,
  createDefaultEditorState,
  validateEditorStateSnapshot
} from "../src/shared/editor-domain";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";

describe("YouTube volume normalization", () => {
  it("accepts the MCP operation and persists YouTube-safe defaults", () => {
    const operation = {
      type: "set_youtube_volume",
      enabled: true,
      targetLufs: -14,
      truePeakDb: -1
    };
    expect(() => operationSchema.parse(operation)).not.toThrow();
    const result = applyEditorOperations(createDefaultEditorState(), [operation]);
    expect(result.state.youtubeVolume).toEqual({ enabled: true, targetLufs: -14, truePeakDb: -1 });
    expect(validateEditorStateSnapshot(result.state)).toBe(true);
  });

  it("keeps the previous target when only toggling the setting", () => {
    const state = createDefaultEditorState();
    state.youtubeVolume = { enabled: false, targetLufs: -13, truePeakDb: -1.5 };
    const result = applyEditorOperations(state, [
      { type: "set_youtube_volume", enabled: true }
    ]);
    expect(result.state.youtubeVolume).toEqual({ enabled: true, targetLufs: -13, truePeakDb: -1.5 });
  });
});
