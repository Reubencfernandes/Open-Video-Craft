import { describe, expect, it } from "vitest";

import {
  validateClipTransitions,
  validateTimeline
} from "../src/shared/editor-domain/operations";
import type { ClipTransition, TimelineSegment } from "../src/shared/editor-domain";
import { getTransitionBetween } from "../src/main/ffmpeg";

function segment(id: string, start: number, end: number, lane: number): TimelineSegment {
  return { id, itemId: `${id}:item`, track: "video", lane, start, end, sourceStart: 0 };
}

describe("lane-aware transition validation", () => {
  it("accepts overlapping clips on different channels", () => {
    expect(() => validateTimeline([
      segment("camera", 0, 3, 0),
      segment("screen", 0, 3, 1)
    ])).not.toThrow();
  });

  it("accepts a transition between adjacent clips on the same channel", () => {
    const segments = [
      segment("camera", 0, 3, 0),
      segment("screen", 0, 3, 1),
      segment("camera-next", 3, 5, 0)
    ];
    const transition: ClipTransition = {
      id: "t1",
      fromSegmentId: "camera",
      toSegmentId: "camera-next",
      type: "crossfade",
      duration: 0.6
    };
    expect(() => validateClipTransitions(segments, [transition])).not.toThrow();
  });

  it("keeps transitions attached to the source segment when export splits a range", () => {
    const transition: ClipTransition = {
      id: "t1",
      fromSegmentId: "from",
      toSegmentId: "to",
      type: "fade-black",
      duration: 0.6
    };
    const from = {
      inputIndex: 0,
      duration: 1,
      gap: false,
      segment: {
        id: "from@0",
        sourceId: "from",
        path: "screen.mp4",
        kind: "video" as const,
        start: 0,
        end: 1,
        sourceStart: 0,
        volume: 1,
        hasAudio: false
      }
    };
    const to = {
      ...from,
      segment: { ...from.segment, id: "to@1", sourceId: "to", start: 1, end: 2 }
    };
    expect(getTransitionBetween(from, to, [transition])).toBe(transition);
  });

  it("still rejects clips that overlap on the same channel", () => {
    expect(() => validateTimeline([
      segment("a", 0, 3, 0),
      segment("b", 2, 4, 0)
    ])).toThrow(/overlap/);
  });
});
