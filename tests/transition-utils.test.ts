import { describe, expect, it } from "vitest";
import {
  getActiveTimelineTransition,
  getNearestTransitionBoundary,
  getTimelineTransitionBoundaries
} from "../src/renderer/editor/transition-utils";
import { getPreviewTransitionLayerStyle } from "../src/renderer/editor/PreviewTransitionLayer";
import type { TimelineMediaClip } from "../src/renderer/editor/types";

function clip(id: string, start: number, duration: number): TimelineMediaClip {
  return {
    id,
    start,
    duration,
    sourceStart: 0,
    lane: 0,
    track: "video",
    item: {
      id: `media-${id}`,
      name: `${id}.mp4`,
      url: `ovc-import://${id}`,
      kind: "video",
      origin: "imported",
      track: "imported",
      duration
    }
  };
}

describe("timeline transition interactions", () => {
  const clips = [clip("a", 0, 3), clip("b", 3, 2), clip("c", 6, 2)];

  it("offers drop targets only where adjacent clips meet", () => {
    const boundaries = getTimelineTransitionBoundaries(clips);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({ cutTime: 3, from: { id: "a" }, to: { id: "b" } });
  });

  it("snaps a drag to the nearest valid cut", () => {
    const boundaries = getTimelineTransitionBoundaries([
      clip("a", 0, 3),
      clip("b", 3, 2),
      clip("c", 5, 2)
    ]);
    expect(getNearestTransitionBoundary(boundaries, 4.8)?.key).toContain("b");
  });

  it("computes preview progress across the centered transition window", () => {
    const active = getActiveTimelineTransition(clips, [{
      id: "transition-a-b",
      fromSegmentId: "a",
      toSegmentId: "b",
      type: "crossfade",
      duration: 1
    }], 3);
    expect(active?.progress).toBe(0.5);
    expect(getActiveTimelineTransition(clips, [], 3)).toBeNull();
  });

  it("creates distinct visual states for every transition style", () => {
    expect(getPreviewTransitionLayerStyle("crossfade", 0.25, "incoming").opacity).toBe(0.25);
    expect(getPreviewTransitionLayerStyle("fade-black", 0.25, "outgoing").opacity).toBe(0.5);
    expect(getPreviewTransitionLayerStyle("slide-left", 0.25, "incoming").transform).toBe("translateX(75%)");
    expect(getPreviewTransitionLayerStyle("wipe-left", 0.25, "incoming").clipPath).toBe("inset(0 0 0 75%)");
  });
});
