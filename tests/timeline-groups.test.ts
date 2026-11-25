// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTimelineClipGroupIds,
  getTimelineClipGroupRole,
  getTimelineClipGroupRoles,
  getTimelineClipGroups,
  toTimelineGroupableClip
} from "../src/renderer/editor/timeline-groups";
import { TimelineTracks } from "../src/renderer/editor/TimelineTracks";
import { resolveTimelineClipPress } from "../src/renderer/editor/timeline-selection";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

function media(id: string, kind: "video" | "audio" = "video"): EditorMediaItem {
  return {
    id,
    name: id,
    url: id,
    kind,
    origin: "recorded",
    track: kind === "video" ? "recording" : "audio",
    duration: 30
  };
}

function clip(input: {
  id: string;
  item?: string;
  track?: "video" | "audio";
  lane?: number;
  start: number;
  duration: number;
  hidden?: boolean;
}): TimelineMediaClip {
  const track = input.track ?? "video";
  return {
    id: input.id,
    item: media(input.item ?? input.id, track),
    track,
    lane: input.lane ?? 0,
    start: input.start,
    duration: input.duration,
    sourceStart: input.start,
    hidden: input.hidden
  };
}

describe("timeline clip groups", () => {
  it("groups abutting clips of one channel, even from different sources", () => {
    const clips = [
      clip({ id: "a", item: "screen-a", start: 0, duration: 4 }),
      clip({ id: "b", item: "screen-b", start: 4, duration: 6 }),
      clip({ id: "c", item: "screen-b", start: 12, duration: 3 })
    ];

    expect(getTimelineClipGroups(clips.map(toTimelineGroupableClip))).toEqual([
      { track: "video", lane: 0, ids: ["a", "b"] }
    ]);
  });

  it("keeps channels, tracks and hidden clips out of a group", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "other-lane", lane: 1, start: 4, duration: 4 }),
      clip({ id: "mic", track: "audio", start: 4, duration: 4 }),
      clip({ id: "hidden", start: 8, duration: 4, hidden: true })
    ];

    expect(getTimelineClipGroups(clips.map(toTimelineGroupableClip))).toEqual([]);
  });

  it("returns the block ids for a member and the clip itself when it stands alone", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "b", start: 4, duration: 4 }),
      clip({ id: "solo", start: 20, duration: 4 })
    ].map(toTimelineGroupableClip);

    expect(getTimelineClipGroupIds(clips, "b")).toEqual(["a", "b"]);
    expect(getTimelineClipGroupIds(clips, "solo")).toEqual(["solo"]);
  });
});

describe("clip roles inside a block", () => {
  it("gives the outer members start and end and the inner one middle", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "b", start: 4, duration: 4 }),
      clip({ id: "c", start: 8, duration: 4 })
    ].map(toTimelineGroupableClip);

    expect(getTimelineClipGroupRole(clips, "a")).toBe("start");
    expect(getTimelineClipGroupRole(clips, "b")).toBe("middle");
    expect(getTimelineClipGroupRole(clips, "c")).toBe("end");
  });

  it("leaves no middle role in a block of two abutting clips", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "b", start: 4, duration: 4 })
    ].map(toTimelineGroupableClip);

    expect(getTimelineClipGroupRole(clips, "a")).toBe("start");
    expect(getTimelineClipGroupRole(clips, "b")).toBe("end");
  });

  it("keeps a clip with no abutting neighbour single", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "solo", start: 20, duration: 4 }),
      clip({ id: "mic", track: "audio", start: 24, duration: 4 })
    ].map(toTimelineGroupableClip);

    expect(getTimelineClipGroupRole(clips, "solo")).toBe("single");
    expect(getTimelineClipGroupRole(clips, "mic")).toBe("single");
    expect(getTimelineClipGroupRole(clips, "missing")).toBe("single");
  });

  it("derives every role from one grouping pass", () => {
    const clips = [
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "b", start: 4, duration: 4 }),
      clip({ id: "c", start: 8, duration: 4 }),
      clip({ id: "solo", start: 20, duration: 4 })
    ].map(toTimelineGroupableClip);

    expect([...getTimelineClipGroupRoles(clips)]).toEqual([
      ["a", "start"],
      ["b", "middle"],
      ["c", "end"],
      ["solo", "single"]
    ]);
  });
});

describe("pressing a grouped clip", () => {
  it("selects the whole block so the drag carries it", () => {
    const press = resolveTimelineClipPress([], "b", false, ["a", "b"]);

    expect(press.ids).toEqual(["a", "b"]);
    expect(press.primaryId).toBe("b");
    expect(press.draggable).toBe(true);
    // A block press must not collapse to the pressed clip on release.
    expect(press.collapseOnRelease).toBe(false);
  });

  it("keeps an existing multi-selection instead of replacing it with the block", () => {
    const press = resolveTimelineClipPress(["a", "b", "x"], "a", false, ["a", "b"]);

    expect(press.ids).toEqual(["a", "b", "x"]);
    expect(press.collapseOnRelease).toBe(true);
  });

  it("toggles the whole block with a modifier press", () => {
    const press = resolveTimelineClipPress(["x"], "a", true, ["a", "b"]);

    expect(press.ids).toEqual(["x", "a", "b"]);
  });

  it("stays a single clip when it belongs to no block", () => {
    const press = resolveTimelineClipPress([], "solo", false, ["solo"]);

    expect(press.ids).toEqual(["solo"]);
    expect(press.collapseOnRelease).toBe(false);
  });
});

describe("merged look for a block of clips", () => {
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
  });

  function renderTimeline(clips: TimelineMediaClip[]): HTMLElement {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const handler = vi.fn();

    flushSync(() =>
      root?.render(
        createElement(TimelineTracks, {
          renderDuration: 30,
          videoClips: clips,
          onToggleVideoLaneVisibility: handler,
          onSwapVideoChannels: handler,
          audioTracks: [],
          audioLevels: {},
          zoomEffects: [],
          speedEffects: [],
          transitions: [],
          transitionBoundaries: [],
          transitionDropKey: null,
          subtitles: [],
          textOverlays: [],
          selectedSegmentIds: [],
          linkedSegmentIds: [],
          selectedCount: 0,
          selectedNoun: "clip",
          rangeSelection: null,
          selectedZoomId: null,
          selectedSpeedId: null,
          selectedSubtitleId: null,
          selectedTextOverlayId: null,
          onSetAudioLevel: handler,
          onSelectClip: handler,
          onSelectZoom: handler,
          onSelectSpeed: handler,
          onSelectTransition: handler,
          onSelectSubtitle: handler,
          onSelectTextOverlay: handler,
          onTrimPointerDown: handler,
          onMovePointerDown: handler,
          onZoomDragPointerDown: handler,
          onSpeedDragPointerDown: handler,
          onSubtitleDragPointerDown: handler,
          onTextOverlayDragPointerDown: handler,
          onInteractionPointerMove: handler,
          onInteractionPointerUp: handler
        })
      )
    );

    return host;
  }

  function clipElement(host: HTMLElement, segmentId: string): HTMLElement {
    const element = host.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`);
    if (!element) throw new Error(`clip ${segmentId} did not render`);
    return element;
  }

  it("renders two abutting clips as the start and the end of one block", () => {
    const host = renderTimeline([
      clip({ id: "a", item: "screen-a", start: 0, duration: 4 }),
      clip({ id: "b", item: "screen-b", start: 4, duration: 4 })
    ]);

    const start = clipElement(host, "a");
    const end = clipElement(host, "b");
    expect(start.getAttribute("data-group-role")).toBe("start");
    expect(end.getAttribute("data-group-role")).toBe("end");
    // The seam between the members disappears: no inner rounding, no inner border.
    expect(start.className).toContain("rounded-r-none");
    expect(start.className).toContain("border-r-0");
    expect(end.className).toContain("rounded-l-none");
    expect(end.className).toContain("border-l-0");
  });

  it("renders a lone clip as a single clip with its own rounded outline", () => {
    const host = renderTimeline([
      clip({ id: "a", start: 0, duration: 4 }),
      clip({ id: "solo", start: 20, duration: 4 })
    ]);

    const solo = clipElement(host, "solo");
    expect(solo.getAttribute("data-group-role")).toBe("single");
    expect(solo.className).toContain("rounded-md");
    expect(solo.className).not.toContain("rounded-r-none");
    expect(solo.className).not.toContain("rounded-l-none");
  });
});
