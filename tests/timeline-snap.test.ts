// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";

import { snapTimeToCuts, timelineCutTimes } from "../src/renderer/editor/timeline-utils";
import { useTimelineViewport } from "../src/renderer/editor/useTimelineViewport";
import type { TimelineSegment } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

const segment = (id: string, start: number, end: number): TimelineSegment => ({
  id,
  itemId: `item-${id}`,
  track: "video",
  lane: 0,
  start,
  end,
  sourceStart: 0
});

describe("playhead snapping", () => {
  it("lists every clip boundary once, in order", () => {
    expect(timelineCutTimes([segment("a", 0, 4), segment("b", 4, 9)])).toEqual([0, 4, 9]);
  });

  it("locks onto a cut that is close enough", () => {
    expect(snapTimeToCuts(4.05, [0, 4, 9])).toEqual({ time: 4, snappedTo: 4 });
  });

  it("leaves a seek alone when no cut is nearby", () => {
    expect(snapTimeToCuts(6.5, [0, 4, 9])).toEqual({ time: 6.5, snappedTo: null });
  });

  it("prefers the nearest cut when two are in range", () => {
    expect(snapTimeToCuts(4.02, [3.95, 4.05], 0.1).time).toBe(4.05);
  });
});

type ViewportHook = ReturnType<typeof useTimelineViewport>;

/** A 1000px ruler over 10s, so 500px is 5s. */
function renderViewport(cutTimes: number[]) {
  const seek = vi.fn();
  const holder: { viewport: ViewportHook | null } = { viewport: null };

  function Harness() {
    holder.viewport = useTimelineViewport({
      beginPlaybackInteraction: vi.fn(),
      contentDuration: 10,
      cutTimes,
      endPlaybackInteraction: vi.fn(),
      renderDuration: 10,
      seek,
      setScrubbingTimeline: vi.fn(),
      timelineZoom: 1,
      setTimelineZoom: vi.fn(),
      setTimelineViewDuration: vi.fn()
    });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(Harness)));
  const viewport = holder.viewport as ViewportHook;

  const body = document.createElement("div");
  const lane = document.createElement("div");
  lane.className = "track-lane";
  lane.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 20,
      width: 1000,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
  body.append(lane);
  viewport.bodyRef.current = body;

  return { viewport, seek };
}

function rulerPointer(clientX: number) {
  return {
    button: 0,
    clientX,
    altKey: false,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn()
    }
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("seeking with the pointer", () => {
  it("leaves a click exactly where it landed, even next to a cut", () => {
    const { viewport, seek } = renderViewport([5.05]);

    viewport.beginTimelineRulerPointer(rulerPointer(500));

    // 5s is 50ms from the cut at 5.05s: a click must not be pulled onto it.
    expect(seek).toHaveBeenLastCalledWith(5);
  });

  it("still locks onto a nearby cut while the ruler is dragged", () => {
    const { viewport, seek } = renderViewport([5.05]);

    viewport.beginTimelineRulerPointer(rulerPointer(500));
    viewport.moveTimelineRulerPointer(rulerPointer(500));

    expect(seek).toHaveBeenLastCalledWith(5.05);
  });

  it("keeps the cut guide for drags that already started", () => {
    const { viewport, seek } = renderViewport([5.05]);

    viewport.seekTimelinePointer(500);
    expect(seek).toHaveBeenLastCalledWith(5.05);

    seek.mockClear();
    viewport.seekTimelinePointer(500, { snap: false });
    expect(seek).toHaveBeenLastCalledWith(5);
  });
});
