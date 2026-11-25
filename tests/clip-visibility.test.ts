// @vitest-environment jsdom
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCompositionLayers } from "../src/shared/editor-domain/timeline-visibility";
import type { CompositionClip } from "../src/shared/editor-domain/timeline-visibility";
import { resolvePreviewComposition } from "../src/renderer/editor/composition-layers";
import { TimelineContextMenuView } from "../src/renderer/editor/TimelineChrome";
import { TimelineClip } from "../src/renderer/editor/TimelineClips";
import { resolveTimelineContextMenuTarget } from "../src/renderer/editor/timeline-selection";
import { useEditorShortcuts } from "../src/renderer/editor/useEditorShortcuts";
import {
  areTimelineSegmentsHidden,
  resolveVisibilityToggleClipIds,
  useTimelineEditing
} from "../src/renderer/editor/useTimelineEditing";
import type {
  EditorMediaItem,
  TimelineMediaClip,
  TimelineSegment
} from "../src/renderer/editor/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const clip = (id: string, lane: number, hidden?: boolean): CompositionClip => ({
  id,
  role: "base",
  lane,
  start: 0,
  end: 10,
  ...(hidden === undefined ? {} : { hidden })
});

describe("deactivated clips", () => {
  it("keeps a deactivated channel off screen and shows the next one", () => {
    const layers = resolveCompositionLayers([clip("main", 0, true), clip("second", 1)], 3);
    expect(layers.primary?.id).toBe("second");
  });

  it("still prefers the lowest channel when nothing is deactivated", () => {
    const layers = resolveCompositionLayers([clip("main", 0), clip("second", 1)], 3);
    expect(layers.primary?.id).toBe("main");
  });

  it("shows nothing when every channel is deactivated", () => {
    expect(
      resolveCompositionLayers([clip("main", 0, true), clip("second", 1, true)], 3).primary
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H over a multi-selection.
// ---------------------------------------------------------------------------

/** Renders the keyboard layer over a timeline body, a text field and a toolbar. */
function renderShortcutHarness() {
  const toggleHidden = vi.fn();
  const deleteSelected = vi.fn();

  function Harness() {
    useEditorShortcuts({
      currentTime: 4,
      currentTimeRef: { current: 4 },
      selectedTimelineSegmentId: "clip-1",
      hasTimelineRangeSelection: false,
      seek: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      openExport: vi.fn(),
      copyClip: vi.fn(),
      cutClip: vi.fn(),
      pasteClip: vi.fn(),
      splitAtPlayhead: vi.fn(),
      togglePlayback: vi.fn(),
      deleteSelected,
      toggleHidden,
      selectAll: vi.fn()
    });

    return createElement(
      "div",
      null,
      createElement(
        "div",
        { "data-timeline-body": true },
        createElement("button", { type: "button", "data-segment-id": "clip-1" }, "Clip one"),
        createElement("input", { type: "text", "aria-label": "Clip note" })
      ),
      createElement("input", { type: "text", "aria-label": "Project name" }),
      createElement("button", { type: "button", "aria-label": "Split at playhead" }, "Split")
    );
  }

  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(Harness)));

  return {
    toggleHidden,
    deleteSelected,
    clip: host.querySelector<HTMLButtonElement>("[data-segment-id='clip-1']")!,
    clipNote: host.querySelector<HTMLInputElement>("input[aria-label='Clip note']")!,
    projectName: host.querySelector<HTMLInputElement>("input[aria-label='Project name']")!,
    toolbarButton: host.querySelector<HTMLButtonElement>("button[aria-label='Split at playhead']")!
  };
}

function press(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  target.dispatchEvent(event);
  return event;
}

describe("H toggles the selected clips", () => {
  it("toggles the multi-selection when the focused element is a timeline clip", () => {
    const { clip: clipButton, toggleHidden } = renderShortcutHarness();
    clipButton.focus();

    const event = press(clipButton, "h");

    // The clip is a button for accessibility, and it is exactly where the owner
    // presses H after selecting clips, so focus must not swallow the toggle.
    expect(event.defaultPrevented).toBe(true);
    expect(toggleHidden).toHaveBeenCalledOnce();
  });

  it("toggles once per press and not again while the key repeats", () => {
    const { toggleHidden } = renderShortcutHarness();
    document.body.focus();
    press(document.body, "h");
    expect(toggleHidden).toHaveBeenCalledOnce();
  });

  it("does not toggle while the owner types in a text field", () => {
    const { projectName, clipNote, toggleHidden } = renderShortcutHarness();

    projectName.focus();
    press(projectName, "h");
    // Even a field that lives inside the timeline body keeps its native typing.
    clipNote.focus();
    press(clipNote, "h");

    expect(toggleHidden).not.toHaveBeenCalled();
  });

  it("does not toggle from an unrelated interactive control", () => {
    const { toolbarButton, toggleHidden } = renderShortcutHarness();
    toolbarButton.focus();
    press(toolbarButton, "h");
    expect(toggleHidden).not.toHaveBeenCalled();
  });

  it("ignores H with a platform modifier", () => {
    const { clip: clipButton, toggleHidden } = renderShortcutHarness();
    clipButton.focus();
    press(clipButton, "h", { metaKey: true });
    press(clipButton, "h", { ctrlKey: true });
    expect(toggleHidden).not.toHaveBeenCalled();
  });

  it("still deletes with Delete while a clip has focus", () => {
    const { clip: clipButton, deleteSelected } = renderShortcutHarness();
    clipButton.focus();
    press(clipButton, "Delete");
    expect(deleteSelected).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// The toggle itself.
// ---------------------------------------------------------------------------

type EditingHook = ReturnType<typeof useTimelineEditing>;

const screenItem: EditorMediaItem = {
  id: "rec:screen",
  name: "screen.webm",
  url: "ovc-media://screen",
  kind: "video",
  origin: "project",
  track: "screen",
  duration: 10,
  channel: 0
};
const secondScreenItem: EditorMediaItem = {
  ...screenItem,
  id: "rec:screen-2",
  url: "ovc-media://screen-2",
  channel: 1
};

const channelClip = (id: string, itemId: string, lane: number): TimelineSegment => ({
  id,
  itemId,
  track: "video",
  lane,
  start: 0,
  end: 10,
  sourceStart: 0
});

const channels = () => [
  channelClip("screen", screenItem.id, 0),
  channelClip("screen-2", secondScreenItem.id, 1)
];

/** Renders the editing hook over live state so commits and undo are real. */
function renderEditingHarness(params: { segments: TimelineSegment[]; selectedIds: string[] }) {
  const holder: { editing: EditingHook | null; segments: TimelineSegment[] } = {
    editing: null,
    segments: params.segments
  };

  function Harness() {
    const [segments, setSegments] = useState(params.segments);
    const [selectedIds, setSelectedIds] = useState(params.selectedIds);
    holder.segments = segments;
    holder.editing = useTimelineEditing({
      activeDuration: 0,
      audioElsRef: { current: new Map() },
      getTimelineTimeFromClientX: () => null,
      isEditorStateReady: false,
      knownTimelineItemIdsRef: { current: new Set<string>() },
      mediaById: new Map(),
      mediaDurationById: new Map(),
      onDropNewTextOverlay: () => undefined,
      scheduleTimelinePlaybackSync: () => undefined,
      seek: () => undefined,
      selectedItemId: null,
      selectedTimelineItemId: null,
      selectedTimelineSegmentId: null,
      selectedTimelineSegmentIds: selectedIds,
      allMedia: [],
      setSelectedItemId: () => undefined,
      setSelectedTimelineSegmentId: () => undefined,
      setSelectedTimelineSegmentIds: setSelectedIds,
      setTimelineContextMenu: () => undefined,
      setTimelineRangeSelection: () => undefined,
      setTimelineSegments: setSegments,
      setTimelineViewDuration: () => undefined,
      setTrimRange: () => undefined,
      timelineDuration: 10,
      timelineEditableItems: [],
      timelineRenderDuration: 10,
      timelineSegments: segments,
      updateMediaDuration: () => undefined
    });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(Harness)));
  return {
    editing: () => holder.editing as EditingHook,
    segments: () => holder.segments,
    hiddenFlags: () => holder.segments.map((segment) => segment.hidden === true)
  };
}

describe("toggling visibility of the selection", () => {
  it("hides every selected clip in one undoable step and shows them again", () => {
    const { editing, hiddenFlags } = renderEditingHarness({
      segments: channels(),
      selectedIds: ["screen", "screen-2"]
    });

    act(() => editing().toggleSelectedTimelineHidden());
    expect(hiddenFlags()).toEqual([true, true]);

    act(() => editing().toggleSelectedTimelineHidden());
    expect(hiddenFlags()).toEqual([false, false]);

    // Exactly one undo entry per toggle: undo returns to the hidden state, and
    // a second undo returns to the untouched timeline.
    act(() => editing().undoTimelineEdit());
    expect(hiddenFlags()).toEqual([true, true]);
    act(() => editing().undoTimelineEdit());
    expect(hiddenFlags()).toEqual([false, false]);
  });

  it("toggles only the targeted clips when the menu addresses a subset", () => {
    const { editing, hiddenFlags } = renderEditingHarness({
      segments: channels(),
      selectedIds: ["screen", "screen-2"]
    });

    act(() => editing().toggleSelectedTimelineHidden(["screen-2"]));
    expect(hiddenFlags()).toEqual([false, true]);
  });

  it("keeps hidden clips out of the preview and puts them back when shown", () => {
    const { editing, segments } = renderEditingHarness({
      segments: channels(),
      selectedIds: ["screen", "screen-2"]
    });
    const items = new Map([
      [screenItem.id, screenItem],
      [secondScreenItem.id, secondScreenItem]
    ]);
    const composition = () =>
      resolvePreviewComposition({
        clips: segments().map<TimelineMediaClip>((segment) => ({
          id: segment.id,
          item: items.get(segment.itemId) as EditorMediaItem,
          track: "video",
          lane: segment.lane,
          start: segment.start,
          duration: segment.end - segment.start,
          sourceStart: segment.sourceStart,
          ...(segment.hidden === true ? { hidden: true } : {})
        })),
        time: 3,
        projectLayout: "bubble"
      }).base?.id ?? null;

    expect(composition()).toBe("screen");

    act(() => editing().toggleSelectedTimelineHidden());
    expect(composition()).toBeNull();

    act(() => editing().toggleSelectedTimelineHidden());
    expect(composition()).toBe("screen");
  });
});

// ---------------------------------------------------------------------------
// How a deactivated clip looks in the timeline.
// ---------------------------------------------------------------------------

function renderClip(hidden: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root?.render(
      createElement(TimelineClip, {
        clip: {
          id: "clip",
          item: screenItem,
          track: "video",
          lane: 0,
          start: 0,
          duration: 10,
          sourceStart: 0,
          ...(hidden ? { hidden: true } : {})
        } as TimelineMediaClip,
        timelineDuration: 10,
        selected: true,
        onSelect: vi.fn(),
        onTrimPointerDown: vi.fn(),
        onMovePointerDown: vi.fn(),
        onInteractionPointerMove: vi.fn(),
        onInteractionPointerUp: vi.fn()
      })
    )
  );
  return host.querySelector<HTMLElement>("[data-segment-id='clip']") as HTMLElement;
}

describe("a deactivated clip in the timeline", () => {
  it("looks switched off and says so to assistive technology", () => {
    const element = renderClip(true);

    expect(element.dataset.hidden).toBe("true");
    expect(element.className).toContain("opacity-40");
    expect(element.className).toContain("saturate-0");
    expect(element.querySelector("[data-hidden-overlay]")).not.toBeNull();
    expect(element.getAttribute("aria-label")).toContain("hidden");
    expect(element.title).toContain("hidden");
  });

  it("leaves an active clip marked as before", () => {
    const element = renderClip(false);

    expect(element.dataset.hidden).toBeUndefined();
    expect(element.className).not.toContain("opacity-40");
    expect(element.querySelector("[data-hidden-overlay]")).toBeNull();
    expect(element.getAttribute("aria-label")).toBeNull();
    expect(element.title).toBe("screen.webm");
  });
});

// ---------------------------------------------------------------------------
// The context-menu Hide/Show command.
// ---------------------------------------------------------------------------

function renderContextMenu(params: {
  clipsHidden: boolean;
  canToggleHidden?: boolean;
  onToggleHidden?: () => void;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root?.render(
      createElement(TimelineContextMenuView, {
        x: 10,
        y: 20,
        canSplit: true,
        canDelete: true,
        canToggleHidden: params.canToggleHidden ?? true,
        clipsHidden: params.clipsHidden,
        onToggleHidden: params.onToggleHidden ?? (() => undefined),
        onSplit: () => undefined,
        onDelete: () => undefined
      })
    )
  );
  return host.querySelector<HTMLButtonElement>("[data-context-menu-hide]") as HTMLButtonElement;
}

describe("the timeline context menu", () => {
  it("offers Hide for a visible selection and Show once every addressed clip is hidden", () => {
    expect(renderContextMenu({ clipsHidden: false }).textContent).toBe("Hide");
    act(() => root?.unmount());
    document.body.innerHTML = "";
    expect(renderContextMenu({ clipsHidden: true }).textContent).toBe("Show");
  });

  it("invokes the multi-clip toggle from the menu item", () => {
    const onToggleHidden = vi.fn();
    const item = renderContextMenu({ clipsHidden: false, onToggleHidden });

    act(() => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleHidden).toHaveBeenCalledOnce();
  });

  it("is disabled when the menu does not address a clip", () => {
    const item = renderContextMenu({ clipsHidden: false, canToggleHidden: false });
    expect(item.disabled).toBe(true);
  });

  it("addresses the whole selection when the menu was opened on one of its clips", () => {
    expect(resolveVisibilityToggleClipIds(["a", "b"], "b")).toEqual(["a", "b"]);
    // A right-click on another clip re-targets the selection, so the command
    // must act on that single clip instead of the old selection.
    expect(resolveVisibilityToggleClipIds(["a", "b"], "c")).toEqual(["c"]);
    expect(resolveVisibilityToggleClipIds(["a"], null)).toEqual(["a"]);
    expect(resolveVisibilityToggleClipIds([], null)).toEqual([]);
  });

  it("reflects Show only when every addressed clip is already hidden", () => {
    const segments = [
      { ...channelClip("a", screenItem.id, 0), hidden: true },
      channelClip("b", screenItem.id, 1)
    ];

    expect(areTimelineSegmentsHidden(segments, ["a", "b"])).toBe(false);
    expect(areTimelineSegmentsHidden(segments, ["a"])).toBe(true);
    expect(areTimelineSegmentsHidden(segments, [])).toBe(false);
  });

  it("keeps a multi-selection on right-click so Hide covers every selected clip", () => {
    const onClip = resolveTimelineContextMenuTarget({
      selectedIds: ["a", "b"],
      clipElementId: "b",
      clipAtTimeId: "a"
    });
    // A right-click that lands on one of the selected clips keeps the group.
    expect(onClip.selectId).toBeNull();
    expect(resolveVisibilityToggleClipIds(["a", "b"], onClip.segmentId)).toEqual(["a", "b"]);

    const onEmptyLane = resolveTimelineContextMenuTarget({
      selectedIds: ["a", "b"],
      clipElementId: null,
      clipAtTimeId: "b"
    });
    expect(onEmptyLane.selectId).toBeNull();
    expect(resolveVisibilityToggleClipIds(["a", "b"], onEmptyLane.segmentId)).toEqual([
      "a",
      "b"
    ]);
  });
});
