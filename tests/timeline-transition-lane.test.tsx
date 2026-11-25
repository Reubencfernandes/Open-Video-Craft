// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineTracks } from "../src/renderer/editor/TimelineTracks";
import { getTransitionBoundaryKey } from "../src/renderer/editor/transition-utils";
import type { ClipTransition, EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

function media(id: string): EditorMediaItem {
  return {
    id,
    name: `${id}.webm`,
    url: `ovc-media://${id}`,
    kind: "video",
    origin: "recorded",
    track: "recording",
    duration: 20
  };
}

function clip(input: {
  id: string;
  item: string;
  lane: number;
  start: number;
  duration: number;
}): TimelineMediaClip {
  return {
    id: input.id,
    item: media(input.item),
    track: "video",
    lane: input.lane,
    start: input.start,
    duration: input.duration,
    sourceStart: 0
  };
}

function renderTracks(input: { clips: TimelineMediaClip[]; transitions: ClipTransition[] }) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const handler = vi.fn();
  const boundaries = input.transitions.flatMap((transition) => {
    const from = input.clips.find((item) => item.id === transition.fromSegmentId);
    const to = input.clips.find((item) => item.id === transition.toSegmentId);
    return from && to
      ? [
          {
            key: getTransitionBoundaryKey(from.id, to.id),
            from,
            to,
            cutTime: from.start + from.duration
          }
        ]
      : [];
  });

  flushSync(() =>
    root?.render(
      createElement(TimelineTracks, {
        renderDuration: 10,
        videoClips: input.clips,
        onToggleVideoLaneVisibility: handler,
        onSwapVideoChannels: handler,
        audioTracks: [],
        audioLevels: {},
        zoomEffects: [],
        speedEffects: [],
        transitions: input.transitions,
        transitionBoundaries: boundaries,
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

function transitionBetween(fromSegmentId: string, toSegmentId: string): ClipTransition {
  return {
    id: `${fromSegmentId}-${toSegmentId}`,
    fromSegmentId,
    toSegmentId,
    type: "crossfade",
    duration: 0.6
  };
}

function markersIn(host: HTMLElement, laneId: string): Element[] {
  return Array.from(
    host.querySelectorAll(`[data-timeline-lane="${laneId}"] [data-timeline-transition-id]`)
  );
}

describe("timeline transition markers", () => {
  it("renders a screen-to-screen transition on the screen channel", () => {
    const clips = [
      clip({ id: "camera", item: "camera", lane: 0, start: 0, duration: 10 }),
      clip({ id: "screen-a", item: "screen", lane: 1, start: 0, duration: 4 }),
      clip({ id: "screen-b", item: "screen", lane: 1, start: 4, duration: 6 })
    ];
    const host = renderTracks({
      clips,
      transitions: [transitionBetween("screen-a", "screen-b")]
    });

    expect(markersIn(host, "video:1")).toHaveLength(1);
    expect(markersIn(host, "video")).toHaveLength(0);
  });

  it("keeps a first-channel transition on the first channel", () => {
    const clips = [
      clip({ id: "camera-a", item: "camera", lane: 0, start: 0, duration: 4 }),
      clip({ id: "camera-b", item: "camera", lane: 0, start: 4, duration: 6 }),
      clip({ id: "screen", item: "screen", lane: 1, start: 0, duration: 10 })
    ];
    const host = renderTracks({
      clips,
      transitions: [transitionBetween("camera-a", "camera-b")]
    });

    expect(markersIn(host, "video")).toHaveLength(1);
    expect(markersIn(host, "video:1")).toHaveLength(0);
  });

  it("keeps every marker on its own channel when both channels have transitions", () => {
    const clips = [
      clip({ id: "camera-a", item: "camera", lane: 0, start: 0, duration: 4 }),
      clip({ id: "camera-b", item: "camera", lane: 0, start: 4, duration: 6 }),
      clip({ id: "screen-a", item: "screen", lane: 1, start: 0, duration: 4 }),
      clip({ id: "screen-b", item: "screen", lane: 1, start: 4, duration: 6 })
    ];
    const host = renderTracks({
      clips,
      transitions: [
        transitionBetween("camera-a", "camera-b"),
        transitionBetween("screen-a", "screen-b")
      ]
    });

    expect(markersIn(host, "video")).toHaveLength(1);
    expect(markersIn(host, "video:1")).toHaveLength(1);
  });
});
