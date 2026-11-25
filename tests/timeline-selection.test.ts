// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  resolveTimelineClipPress,
  resolveTimelineContextMenuTarget
} from "../src/renderer/editor/timeline-selection";
import { useEditorShortcuts } from "../src/renderer/editor/useEditorShortcuts";
import { useTimelineMediaDragInteractions } from "../src/renderer/editor/useTimelineMediaDragInteractions";
import { splitTimelineSegments } from "../src/renderer/editor/timeline-split";
import { getContextMenuSplitSelectionIds } from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

describe("pressing a timeline clip", () => {
  it("selects only the pressed clip", () => {
    expect(resolveTimelineClipPress(["a"], "b", false)).toEqual({
      ids: ["b"],
      primaryId: "b",
      draggable: true,
      keepRange: false,
      collapseOnRelease: false
    });
  });

  it("keeps a group for dragging and collapses to the clip if it was just a click", () => {
    const press = resolveTimelineClipPress(["a", "b", "c"], "b", false);
    expect(press.ids).toEqual(["a", "b", "c"]);
    expect(press.primaryId).toBe("b");
    expect(press.draggable).toBe(true);
    expect(press.collapseOnRelease).toBe(true);
  });

  it("toggles membership with a modifier and never drags a clip it just deselected", () => {
    expect(resolveTimelineClipPress(["a"], "b", true)).toMatchObject({
      ids: ["a", "b"],
      primaryId: "b",
      draggable: true
    });
    expect(resolveTimelineClipPress(["a", "b"], "b", true)).toMatchObject({
      ids: ["a"],
      primaryId: "a",
      draggable: false
    });
  });
});

describe("timeline shortcuts while a clip has focus", () => {
  function renderHarness() {
    const splitAtPlayhead = vi.fn();
    const deleteSelected = vi.fn();
    const seek = vi.fn();

    function Harness() {
      useEditorShortcuts({
        currentTime: 4,
        currentTimeRef: { current: 4 },
        selectedTimelineSegmentId: "clip-1",
        hasTimelineRangeSelection: false,
        seek,
        undo: vi.fn(),
        redo: vi.fn(),
        openExport: vi.fn(),
        copyClip: vi.fn(),
        cutClip: vi.fn(),
        pasteClip: vi.fn(),
        splitAtPlayhead,
        togglePlayback: vi.fn(),
        deleteSelected,
        toggleHidden: vi.fn(),
        selectAll: vi.fn()
      });
      return createElement(
        "div",
        { "data-timeline-body": true },
        createElement("button", { type: "button", "data-segment-id": "clip-1" }, "Clip")
      );
    }

    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(Harness)));
    const clip = host.querySelector<HTMLButtonElement>("[data-segment-id='clip-1']")!;
    clip.focus();
    return { clip, splitAtPlayhead, deleteSelected, seek };
  }

  it("splits with Ctrl/Cmd+B right after the clip was clicked", () => {
    const { clip, splitAtPlayhead } = renderHarness();
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }));
    // The shortcut hands the playhead time to the selection-aware split, which
    // cuts every selected clip or falls back to the single one.
    expect(splitAtPlayhead).toHaveBeenCalledOnce();
    expect(splitAtPlayhead).toHaveBeenCalledWith(4);
  });

  it("still seeks with the arrow keys", () => {
    const { clip, seek } = renderHarness();
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(seek).toHaveBeenCalledWith(5);
  });

  it("deletes only the clip by default and takes its audio on Shift+Delete", () => {
    const { clip, deleteSelected } = renderHarness();
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", shiftKey: true, bubbles: true }));
    // Picture and sound are independent: plain Delete never takes the audio.
    expect(deleteSelected).toHaveBeenNthCalledWith(1, undefined);
    expect(deleteSelected).toHaveBeenNthCalledWith(2, { linked: true });
  });
});

type MediaDragHook = ReturnType<typeof useTimelineMediaDragInteractions>;

function pointerEvent(clientX: number, modifiers: Record<string, boolean> = {}) {
  return {
    button: 0,
    clientX,
    clientY: 0,
    pointerId: 1,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("pressing a clip parks the playhead", () => {
  const clip: TimelineSegment = {
    id: "clip-1",
    itemId: "clip-item",
    track: "video",
    lane: 0,
    start: 0,
    end: 10,
    sourceStart: 0
  };

  /** Renders the media drag hook: pointer X maps 100px to one second. */
  function renderPressHarness(params: { segments: TimelineSegment[]; selectedIds?: string[] }) {
    const seek = vi.fn();
    const applyTimelineClipSelection = vi.fn();
    const setTimelineSegments = vi.fn();
    const holder: { hooks: MediaDragHook | null } = { hooks: null };

    function Harness() {
      holder.hooks = useTimelineMediaDragInteractions({
        applyTimelineClipSelection,
        beginPlaybackInteraction: vi.fn(),
        currentTimeRef: { current: 0 },
        getTimelineTimeFromClientX: (clientX: number) => clientX / 100,
        mediaDurationById: new Map(),
        scheduleTimelinePlaybackSync: vi.fn(),
        seek,
        selectedTimelineSegmentIds: params.selectedIds ?? [],
        setTimelineRangeSelection: vi.fn(),
        setTimelineRedoStack: vi.fn(),
        setTimelineSegments,
        setTimelineUndoStack: vi.fn(),
        timelineBodyRef: { current: null },
        timelineRangeSelection: null,
        timelineRenderDuration: 10,
        timelineSegments: params.segments
      });
      return null;
    }

    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(Harness)));
    return {
      hooks: holder.hooks as MediaDragHook,
      applyTimelineClipSelection,
      seek,
      setTimelineSegments
    };
  }

  it("seeks to the exact pointer time and still selects the clip", () => {
    const { hooks, applyTimelineClipSelection, seek } = renderPressHarness({
      segments: [clip],
      selectedIds: []
    });

    hooks.beginTimelineClipMove(pointerEvent(150), "clip-1");

    expect(seek).toHaveBeenCalledWith(1.5);
    expect(applyTimelineClipSelection).toHaveBeenCalledWith(["clip-1"], "clip-1", {
      keepRange: false
    });
  });

  it("still selects and seeks when a modifier deselects the clip without dragging it", () => {
    const { hooks, applyTimelineClipSelection, seek, setTimelineSegments } = renderPressHarness({
      segments: [clip],
      selectedIds: ["clip-1"]
    });

    hooks.beginTimelineClipMove(pointerEvent(150, { ctrlKey: true }), "clip-1");
    hooks.updateMediaClipDrag(350);

    expect(applyTimelineClipSelection).toHaveBeenCalledWith([], null, { keepRange: false });
    expect(seek).toHaveBeenCalledWith(1.5);
    expect(setTimelineSegments).not.toHaveBeenCalled();
    hooks.finishMediaClipDrags();
  });

  it("never moves the clip on a click, only once the pointer passes the drag threshold", () => {
    const { hooks, setTimelineSegments } = renderPressHarness({ segments: [clip] });

    hooks.beginTimelineClipMove(pointerEvent(150), "clip-1");
    hooks.updateMediaClipDrag(152);
    expect(setTimelineSegments).not.toHaveBeenCalled();

    hooks.updateMediaClipDrag(350);
    const moved = setTimelineSegments.mock.calls.at(-1)?.[0] as TimelineSegment[];
    expect(moved[0]).toMatchObject({ id: "clip-1", start: 2, end: 12 });
    hooks.finishMediaClipDrags();
  });
});

describe("opening the timeline context menu", () => {
  const segment = (id: string, start: number, end: number): TimelineSegment => ({
    id,
    itemId: `item-${id}`,
    track: "video",
    lane: id === "audio" ? 0 : 1,
    start,
    end,
    sourceStart: 0
  });

  it("re-targets the selection when the press lands on another clip", () => {
    expect(
      resolveTimelineContextMenuTarget({
        selectedIds: ["a", "b"],
        clipElementId: "c",
        clipAtTimeId: "a"
      })
    ).toEqual({ segmentId: "c", selectId: "c" });
  });

  it("keeps a multi-selection when the press misses the clips", () => {
    // Background presses used to collapse the selection to whatever clip was
    // under the cursor, which broke a multi-split from the menu.
    expect(
      resolveTimelineContextMenuTarget({
        selectedIds: ["a", "b"],
        clipElementId: null,
        clipAtTimeId: "c"
      })
    ).toEqual({ segmentId: "a", selectId: null });
    expect(
      resolveTimelineContextMenuTarget({
        selectedIds: ["a", "b"],
        clipElementId: null,
        clipAtTimeId: "b"
      })
    ).toEqual({ segmentId: "b", selectId: null });
  });

  it("keeps the single-clip target when the press missed the clip", () => {
    expect(
      resolveTimelineContextMenuTarget({
        selectedIds: ["a"],
        clipElementId: null,
        clipAtTimeId: "c"
      })
    ).toEqual({ segmentId: "c", selectId: null });
  });

  it("splits every selected clip at the pointer time after a background right-click", () => {
    const segments = [segment("a", 0, 10), segment("b", 0, 10), segment("c", 0, 3)];
    const target = resolveTimelineContextMenuTarget({
      selectedIds: ["a", "b"],
      clipElementId: null,
      clipAtTimeId: "c"
    });

    const ids = getContextMenuSplitSelectionIds(segments, ["a", "b"], {
      x: 0,
      y: 0,
      time: 4.05,
      segmentId: target.segmentId
    });

    expect(ids).toEqual(["a", "b"]);
    const result = splitTimelineSegments(segments, "a", 4.05, (id) => `${id}-right`);
    expect(result?.left.end).toBe(4.05);
    expect(result?.right.start).toBe(4.05);
  });
});

describe("dragging a multi-selection", () => {
  const videoClip = (id: string, lane: number, start: number, end: number): TimelineSegment => ({
    id,
    itemId: `item-${id}`,
    track: "video",
    lane,
    start,
    end,
    sourceStart: start
  });

  function renderDragHarness(params: { segments: TimelineSegment[]; selectedIds: string[] }) {
    const applyTimelineClipSelection = vi.fn();
    const setTimelineSegments = vi.fn();
    const holder: { hooks: MediaDragHook | null } = { hooks: null };

    function Harness() {
      holder.hooks = useTimelineMediaDragInteractions({
        applyTimelineClipSelection,
        beginPlaybackInteraction: vi.fn(),
        currentTimeRef: { current: 0 },
        getTimelineTimeFromClientX: (clientX: number) => clientX / 100,
        mediaDurationById: new Map(),
        scheduleTimelinePlaybackSync: vi.fn(),
        seek: vi.fn(),
        selectedTimelineSegmentIds: params.selectedIds,
        setTimelineRangeSelection: vi.fn(),
        setTimelineRedoStack: vi.fn(),
        setTimelineSegments,
        setTimelineUndoStack: vi.fn(),
        timelineBodyRef: { current: null },
        timelineRangeSelection: null,
        timelineRenderDuration: 20,
        timelineSegments: params.segments
      });
      return null;
    }

    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(Harness)));
    return { hooks: holder.hooks as MediaDragHook, applyTimelineClipSelection, setTimelineSegments };
  }

  it("keeps the whole selection and drags every clip together", () => {
    const segments = [videoClip("a", 0, 0, 4), videoClip("b", 0, 4, 8)];
    const { hooks, applyTimelineClipSelection, setTimelineSegments } = renderDragHarness({
      segments,
      selectedIds: ["a", "b"]
    });

    hooks.beginTimelineClipMove(pointerEvent(50), "a");
    expect(applyTimelineClipSelection).toHaveBeenCalledWith(["a", "b"], "a", {
      keepRange: true
    });

    hooks.updateMediaClipDrag(250);
    const moved = setTimelineSegments.mock.calls.at(-1)?.[0] as TimelineSegment[];
    expect(moved.map((segment) => [segment.id, segment.start, segment.end])).toEqual([
      ["a", 2, 6],
      ["b", 6, 10]
    ]);
    hooks.finishMediaClipDrags();
  });

  it("drags clips from several channels by the same amount", () => {
    const segments = [videoClip("a", 0, 0, 4), videoClip("b", 1, 0, 6)];
    const { hooks, setTimelineSegments } = renderDragHarness({
      segments,
      selectedIds: ["a", "b"]
    });

    hooks.beginTimelineClipMove(pointerEvent(50), "b");
    hooks.updateMediaClipDrag(150);
    const moved = setTimelineSegments.mock.calls.at(-1)?.[0] as TimelineSegment[];
    expect(moved.map((segment) => [segment.id, segment.start, segment.lane])).toEqual([
      ["a", 1, 0],
      ["b", 1, 1]
    ]);
    hooks.finishMediaClipDrags();
  });

  it("collapses to the pressed clip when the press never moves", () => {
    const segments = [videoClip("a", 0, 0, 4), videoClip("b", 0, 4, 8)];
    const { hooks, applyTimelineClipSelection, setTimelineSegments } = renderDragHarness({
      segments,
      selectedIds: ["a", "b"]
    });

    hooks.beginTimelineClipMove(pointerEvent(50), "b");
    hooks.finishMediaClipDrags();

    expect(setTimelineSegments).not.toHaveBeenCalled();
    expect(applyTimelineClipSelection).toHaveBeenLastCalledWith(["b"], "b");
  });
});
