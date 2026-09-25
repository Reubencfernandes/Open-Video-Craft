// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTimelineClipPress } from "../src/renderer/editor/timeline-selection";
import { useEditorShortcuts } from "../src/renderer/editor/useEditorShortcuts";

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
        deleteSelected
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
    expect(splitAtPlayhead).toHaveBeenCalledWith("clip-1", 4);
  });

  it("still seeks with the arrow keys", () => {
    const { clip, seek } = renderHarness();
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(seek).toHaveBeenCalledWith(5);
  });

  it("keeps a recording's audio on Alt+Delete", () => {
    const { clip, deleteSelected } = renderHarness();
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    clip.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", altKey: true, bubbles: true }));
    expect(deleteSelected).toHaveBeenNthCalledWith(1, undefined);
    expect(deleteSelected).toHaveBeenNthCalledWith(2, { linked: false });
  });
});
