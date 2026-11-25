import { describe, expect, it } from "vitest";

import {
  resolveCompositionLayers,
  resolveCompositionWindows,
  resolveVisibleVideoRanges,
  visibleRangeOffset
} from "../src/shared/editor-domain/timeline-visibility";
import type { CompositionClip } from "../src/shared/editor-domain/timeline-visibility";
import type { TimelineSegment } from "../src/shared/editor-domain/types";

const segment = (
  id: string,
  lane: number,
  start: number,
  end: number,
  hidden?: boolean
): TimelineSegment => ({
  id,
  itemId: `item-${id}`,
  track: "video",
  lane,
  start,
  end,
  sourceStart: 0,
  ...(hidden === undefined ? {} : { hidden })
});

describe("visible video ranges", () => {
  it("keeps only the lowest channel while two overlap", () => {
    const ranges = resolveVisibleVideoRanges([
      segment("main", 0, 0, 10),
      segment("second", 1, 0, 10)
    ]);

    expect(ranges.map((range) => [range.segment.id, range.start, range.end])).toEqual([
      ["main", 0, 10]
    ]);
  });

  it("falls through to the next channel where the main one was cut away", () => {
    const ranges = resolveVisibleVideoRanges([
      segment("main", 0, 0, 4),
      segment("second", 1, 0, 10)
    ]);

    expect(ranges.map((range) => [range.segment.id, range.start, range.end])).toEqual([
      ["main", 0, 4],
      ["second", 4, 10]
    ]);
  });

  it("leaves a real gap where nothing is visible", () => {
    const ranges = resolveVisibleVideoRanges([segment("main", 0, 0, 4)]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].end).toBe(4);
  });

  it("skips deactivated channels entirely", () => {
    const ranges = resolveVisibleVideoRanges([
      segment("main", 0, 0, 10, true),
      segment("second", 1, 0, 10)
    ]);
    expect(ranges.map((range) => range.segment.id)).toEqual(["second"]);
  });

  it("maps a timeline moment onto the resolved sequence", () => {
    const ranges = resolveVisibleVideoRanges([
      segment("main", 0, 0, 4),
      segment("second", 1, 4, 10)
    ]);
    expect(visibleRangeOffset(ranges, 1)).toBe(1);
    expect(visibleRangeOffset(ranges, 6)).toBe(6);
    expect(visibleRangeOffset([], 3)).toBeNull();
  });
});

const layer = (
  id: string,
  role: CompositionClip["role"],
  lane: number,
  start: number,
  end: number,
  hidden?: boolean
): CompositionClip & { id: string } => ({
  id,
  role,
  lane,
  start,
  end,
  ...(hidden === undefined ? {} : { hidden })
});

describe("composition layers at a moment", () => {
  it("keeps the base picture while a webcam sits on a lower lane", () => {
    const layers = resolveCompositionLayers(
      [layer("camera", "camera", 0, 0, 10), layer("screen", "base", 1, 0, 10)],
      3
    );

    expect(layers.base?.id).toBe("screen");
    expect(layers.camera?.id).toBe("camera");
    expect(layers.primary?.id).toBe("screen");
  });

  it("honours an explicitly selected webcam and otherwise uses the lowest channel", () => {
    const clips = [
      layer("camera-a", "camera", 1, 0, 10),
      layer("camera-b", "camera", 2, 0, 10)
    ];

    expect(resolveCompositionLayers(clips, 3).camera?.id).toBe("camera-a");
    expect(resolveCompositionLayers(clips, 3, "camera-b").camera?.id).toBe("camera-b");
  });

  it("falls through hidden and ended clips independently per role", () => {
    const layers = resolveCompositionLayers(
      [
        layer("screen", "base", 0, 0, 2),
        layer("screen-2", "base", 1, 0, 10),
        layer("camera", "camera", 2, 0, 10, true)
      ],
      3
    );

    expect(layers.base?.id).toBe("screen-2");
    expect(layers.camera).toBeNull();
  });

  it("uses the webcam as the primary picture when no base clip covers the moment", () => {
    const layers = resolveCompositionLayers([layer("camera", "camera", 0, 0, 10)], 3);

    expect(layers.base).toBeNull();
    expect(layers.primary?.id).toBe("camera");
  });
});

describe("composition windows over the whole timeline", () => {
  it("splits the timeline where the visible webcam changes", () => {
    const windows = resolveCompositionWindows([
      layer("screen", "base", 0, 0, 10),
      layer("camera-a", "camera", 1, 0, 4),
      layer("camera-b", "camera", 2, 0, 10)
    ]);

    expect(
      windows.map((window) => [
        window.start,
        window.end,
        window.base?.id ?? null,
        window.camera?.id ?? null
      ])
    ).toEqual([
      [0, 4, "screen", "camera-a"],
      [4, 10, "screen", "camera-b"]
    ]);
  });

  it("keeps the base picture while every webcam is hidden", () => {
    const windows = resolveCompositionWindows([
      layer("screen", "base", 0, 0, 10),
      layer("camera", "camera", 1, 0, 10, true)
    ]);

    expect(windows.map((window) => [window.base?.id, window.camera])).toEqual([
      ["screen", null]
    ]);
  });

  it("merges neighbouring windows that show the same layers", () => {
    const windows = resolveCompositionWindows([
      layer("screen", "base", 0, 0, 10),
      layer("second-screen", "base", 1, 0, 4),
      layer("camera", "camera", 2, 0, 10)
    ]);

    expect(windows.map((window) => [window.start, window.end, window.base?.id])).toEqual([
      [0, 10, "screen"]
    ]);
  });

  it("leaves a window with no layers out of the sequence", () => {
    const windows = resolveCompositionWindows([
      layer("screen", "base", 0, 0, 4),
      layer("camera", "camera", 1, 6, 10)
    ]);

    expect(windows.map((window) => [window.start, window.end])).toEqual([
      [0, 4],
      [6, 10]
    ]);
  });
});
