// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { splitTimelineSegments } from "../src/renderer/editor/timeline-split";
import { canSplitTimelineSegment, canSplitTimelineSelectionAt, syncTimelineSegments } from "../src/renderer/editor/timeline-utils";
import { useTimelineEditing } from "../src/renderer/editor/useTimelineEditing";
import type { EditorMediaItem, TimelineSegment } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

const item: EditorMediaItem = {
  id: "screen",
  name: "screen.webm",
  url: "ovc-media://screen",
  kind: "video",
  origin: "project",
  track: "screen",
  duration: 10
};
const clip: TimelineSegment = {
  id: "v1",
  itemId: "screen",
  track: "video",
  lane: 0,
  start: 0,
  end: 20,
  sourceStart: 0
};

type EditingHook = ReturnType<typeof useTimelineEditing>;

/** Renders the editing hook and exposes its API plus the state setters it calls. */
function renderEditingHook(params: {
  segments: TimelineSegment[];
  selectedIds: string[];
  primaryId: string | null;
}) {
  const spies = {
    seek: vi.fn(),
    setSegments: vi.fn(),
    setSelectedSegmentId: vi.fn(),
    setSelectedSegmentIds: vi.fn()
  };
  const holder: { editing: EditingHook | null } = { editing: null };

  function Harness() {
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
      seek: spies.seek,
      selectedItemId: null,
      selectedTimelineItemId: null,
      selectedTimelineSegmentId: params.primaryId,
      selectedTimelineSegmentIds: params.selectedIds,
      allMedia: [],
      setSelectedItemId: () => undefined,
      setSelectedTimelineSegmentId: spies.setSelectedSegmentId,
      setSelectedTimelineSegmentIds: spies.setSelectedSegmentIds,
      setTimelineContextMenu: () => undefined,
      setTimelineRangeSelection: () => undefined,
      setTimelineSegments: spies.setSegments,
      setTimelineViewDuration: () => undefined,
      setTrimRange: () => undefined,
      timelineDuration: 10,
      timelineEditableItems: [],
      timelineRenderDuration: 10,
      timelineSegments: params.segments,
      updateMediaDuration: () => undefined
    });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(Harness)));
  return { editing: holder.editing as EditingHook, spies };
}

/** Runs the last segment updater the hook scheduled, exactly like the parent would. */
function committedSegments(
  spy: ReturnType<typeof vi.fn>,
  current: TimelineSegment[]
): TimelineSegment[] {
  const updater = spy.mock.calls.at(-1)?.[0];
  return typeof updater === "function" ? updater(current) : updater;
}

describe("split precision", () => {
  it("cuts exactly at the requested time", () => {
    const result = splitTimelineSegments([clip], "v1", 7.37, (id) => `${id}-b`)!;
    expect(result.left.end).toBe(7.37);
    expect(result.right.start).toBe(7.37);
    expect(result.right.sourceStart).toBeCloseTo(7.37, 6);
  });

  it("cuts 50ms after a clip start at exactly that time", () => {
    const result = splitTimelineSegments([clip], "v1", 0.05, (id) => `${id}-b`)!;
    expect(result.left.end).toBe(0.05);
    expect(result.right.start).toBe(0.05);
    expect(result.right.sourceStart).toBeCloseTo(0.05, 6);
  });

  it("never pushes a requested cut away from the pointer", () => {
    // A cut 50ms into the clip used to be clamped to 100ms.
    const later = { ...clip, start: 4, end: 20 };
    const result = splitTimelineSegments([later], "v1", 4.05, (id) => `${id}-b`)!;
    expect(result.left.end).toBe(4.05);
    expect(result.right.start).toBe(4.05);
    expect(result.right.sourceStart).toBeCloseTo(0.05, 6);
  });

  it("refuses only a cut inside the 10ms endpoint allowance", () => {
    expect(canSplitTimelineSegment(clip, 0.05)).toBe(true);
    expect(canSplitTimelineSegment(clip, 0.005)).toBe(false);
    expect(canSplitTimelineSegment(clip, 19.995)).toBe(false);
    expect(splitTimelineSegments([clip], "v1", 0.005)).toBeNull();
    expect(splitTimelineSegments([clip], "v1", 19.995)).toBeNull();
  });

  it("keeps a slowed clip at its real length instead of shrinking it to the media duration", () => {
    // 10s of media played at 0.5x occupies 20s of timeline.
    const [segment] = syncTimelineSegments(
      [clip],
      [item],
      new Map([["screen", 10]]),
      new Set(),
      [{ id: "slow", start: 0, end: 20, rate: 0.5 }]
    );
    expect(segment.end).toBe(20);
  });

  it("still clamps a clip that is longer than its media with no speed effect", () => {
    const [segment] = syncTimelineSegments([clip], [item], new Map([["screen", 10]]), new Set());
    expect(segment.end).toBe(10);
  });
});

describe("splitting the whole selection", () => {
  const twoChannels = (): TimelineSegment[] => [
    { id: "screen", itemId: "rec:screen", track: "video", lane: 0, start: 0, end: 10, sourceStart: 0 },
    { id: "webcam", itemId: "rec:camera", track: "video", lane: 1, start: 0, end: 10, sourceStart: 0 }
  ];

  it("cuts every selected clip and parks the playhead at the cut", async () => {
    const segments = twoChannels();
    const { editing, spies } = renderEditingHook({
      segments,
      selectedIds: ["screen", "webcam"],
      primaryId: "webcam"
    });

    editing.splitSelectionAtPlayhead(4);

    expect(spies.setSegments).toHaveBeenCalledTimes(1);
    const next = committedSegments(spies.setSegments, segments);
    expect(next.filter((segment) => segment.itemId === "rec:screen").map((s) => [s.start, s.end]))
      .toEqual([[0, 4], [4, 10]]);
    expect(next.filter((segment) => segment.itemId === "rec:camera").map((s) => [s.start, s.end]))
      .toEqual([[0, 4], [4, 10]]);
    for (const right of next.filter((segment) => segment.start === 4)) {
      expect(right.sourceStart).toBe(4);
    }
    // A multi-split is a single undoable step that keeps the selection as it is.
    expect(spies.setSelectedSegmentId).not.toHaveBeenCalled();
    expect(spies.setSelectedSegmentIds).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(spies.seek).toHaveBeenCalledWith(4);
  });

  it("enables the split affordance when any selected clip spans the playhead", () => {
    const segments = twoChannels();
    const partlyPast: TimelineSegment[] = [
      { ...segments[0], end: 2 },
      segments[1]
    ];
    // The affordance mirrors the action: one selected clip under the playhead
    // is enough for a multi-selection split.
    expect(canSplitTimelineSelectionAt(partlyPast, ["screen", "webcam"], "screen", 4)).toBe(true);
    const allPast = partlyPast.map((segment) => ({ ...segment, start: 6, end: 10 }));
    expect(canSplitTimelineSelectionAt(allPast, ["screen", "webcam"], "screen", 4)).toBe(false);
    // A single selection keeps the old fallback: the clip under the playhead.
    expect(canSplitTimelineSelectionAt(partlyPast, ["screen"], "screen", 4)).toBe(true);
    expect(canSplitTimelineSelectionAt(allPast, ["screen"], "screen", 4)).toBe(false);
  });

  it("leaves segments, selection and undo history untouched when nothing can be cut", () => {
    const segments = twoChannels();
    const { editing, spies } = renderEditingHook({
      segments,
      selectedIds: ["screen", "webcam"],
      primaryId: "screen"
    });

    editing.splitSelectionAtPlayhead(0.004);

    // The commit updater returns the very same array, so nothing was recorded.
    expect(committedSegments(spies.setSegments, segments)).toBe(segments);
    expect(spies.setSelectedSegmentId).not.toHaveBeenCalled();
    expect(spies.setSelectedSegmentIds).not.toHaveBeenCalled();
    // With no undo entry recorded, undo cannot push another change.
    editing.undoTimelineEdit();
    expect(spies.setSegments).toHaveBeenCalledTimes(1);
  });

  it("keeps the single-clip split behaviour: cut, select the right half, park on the cut", async () => {
    const segments: TimelineSegment[] = [clip];
    const { editing, spies } = renderEditingHook({
      segments,
      selectedIds: ["v1"],
      primaryId: "v1"
    });

    editing.splitSelectionAtPlayhead(4);

    const next = committedSegments(spies.setSegments, segments);
    expect(next).toHaveLength(2);
    const right = next.find((segment) => segment.id !== "v1")!;
    expect(right.start).toBe(4);
    expect(spies.setSelectedSegmentId).toHaveBeenCalledWith(right.id);
    expect(spies.setSelectedSegmentIds).toHaveBeenCalledWith([right.id]);
    await Promise.resolve();
    expect(spies.seek).toHaveBeenCalledWith(4);
  });
});
