import { describe, expect, it } from "vitest";

import { resolveEdgeTransitionTiming } from "../src/main/composition-export";
import {
  sanitizeClipEdgeTransitions,
  validateClipEdgeTransitions
} from "../src/shared/editor-domain/operations";
import { createDefaultEditorState, validateEditorStateSnapshot } from "../src/shared/editor-domain/schema";
import type { ClipEdgeTransition } from "../src/shared/editor-domain";

const clip = {
  id: "clip",
  itemId: "clip:item",
  track: "video" as const,
  lane: 0,
  start: 0,
  end: 2,
  sourceStart: 0
};

const edge: ClipEdgeTransition = {
  id: "edge-1",
  segmentId: "clip",
  edge: "start",
  type: "fade-black",
  duration: 0.6
};

describe("clip edge transitions", () => {
  it("keeps saved documents with edge transitions valid", () => {
    const state = { ...createDefaultEditorState(), edgeTransitions: [edge] };
    expect(validateEditorStateSnapshot(state)).toBe(true);
  });

  it("accepts a transition shorter than the clip and rejects an oversized one", () => {
    expect(() => validateClipEdgeTransitions([clip], [edge])).not.toThrow();
    expect(() => validateClipEdgeTransitions([clip], [{ ...edge, duration: 1.91 }])).toThrow(/too short/);
  });

  it("attaches an edge only to the real start or end of its clip", () => {
    const timing = resolveEdgeTransitionTiming(
      [edge, { ...edge, id: "edge-2", edge: "end", duration: 0.4 }],
      clip,
      0,
      2
    );
    expect(timing).toEqual({ edgeStartSeconds: 0.6, edgeEndSeconds: 0.4 });
    expect(resolveEdgeTransitionTiming([edge], clip, 0.5, 2)).toEqual({});
  });

  it("drops stale edges when their clip disappears", () => {
    expect(sanitizeClipEdgeTransitions([], [edge])).toEqual([]);
  });
});
