import { describe, expect, it } from "vitest";

import { createDefaultEditorState, isTextOverlay, validateEditorStateSnapshot } from "../src/shared/editor-domain/schema";
import { applyEditorOperations } from "../src/shared/editor-domain/operations";
import { operationSchema } from "../src/shared/editor-domain/operation-schema";
import type { TextOverlay } from "../src/shared/editor-domain/types";

const callout: TextOverlay = {
  id: "callout-1",
  start: 1,
  end: 3,
  text: "Key argument",
  title: "TOPIC",
  x: 50,
  y: 25,
  size: 48,
  color: "#ffffff",
  fontFamily: "mono",
  weight: 700,
  animation: "slide-in-out",
  box: {
    backgroundColor: "#123c8f",
    backgroundOpacity: 72,
    borderColor: "#66b3ff",
    borderWidth: 3,
    borderRadius: 18,
    padding: 22,
    titleColor: "#9fd1ff",
    titleSize: 26
  }
};

describe("callout boxes", () => {
  it("validates a titled box with transparent style", () => {
    expect(isTextOverlay(callout)).toBe(true);
    expect(isTextOverlay({ ...callout, box: { ...callout.box, borderRadius: -1 } })).toBe(false);
  });

  it("accepts the AI/MCP operation and persists the box", () => {
    const operation = { type: "set_text_overlay", overlay: callout };
    expect(() => operationSchema.parse(operation)).not.toThrow();
    const state = {
      ...createDefaultEditorState(),
      timelineSegments: [{ id: "v", itemId: "clip", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }],
      trimRange: { start: 0, end: 10 }
    };
    const result = applyEditorOperations(state, [operation]);
    expect(result.state.textOverlays?.[0]).toMatchObject({ title: "TOPIC", box: { borderRadius: 18 } });
    expect(validateEditorStateSnapshot(result.state)).toBe(true);
  });
});
