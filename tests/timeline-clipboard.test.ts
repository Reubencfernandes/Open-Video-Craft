// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimelineClipboard } from "../src/renderer/editor/useTimelineClipboard";
import type { TimelineSegment } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

describe("timeline clipboard", () => {
  it("cuts only the primary clip that was copied", () => {
    const deleteTimelineSegment = vi.fn();
    const segments: TimelineSegment[] = [
      { id: "primary", itemId: "video", track: "video", lane: 0, start: 0, end: 2, sourceStart: 0 },
      { id: "also-selected", itemId: "video", track: "video", lane: 0, start: 2, end: 4, sourceStart: 2 }
    ];

    function Harness() {
      const clipboard = useTimelineClipboard({
        commitTimelineSegments: vi.fn(),
        currentTimeRef: { current: 0 },
        deleteTimelineSegment,
        knownTimelineItemIdsRef: { current: new Set() },
        mediaById: new Map(),
        selectedTimelineSegmentId: "primary",
        setExportMessage: vi.fn(),
        setSelectedItemId: vi.fn(),
        setSelectedTimelineSegmentId: vi.fn(),
        timelineRenderDuration: 4,
        timelineSegments: segments
      });
      return createElement("button", {
        type: "button",
        onClick: clipboard.cutSelectedTimelineSegment
      }, "Cut");
    }

    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(Harness)));
    host.querySelector<HTMLButtonElement>("button")?.click();

    expect(deleteTimelineSegment).toHaveBeenCalledOnce();
    expect(deleteTimelineSegment).toHaveBeenCalledWith("primary");
  });
});
