// @vitest-environment jsdom
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TimelinePlayhead } from "../src/renderer/editor/TimelineChrome";
import { TimelineClip } from "../src/renderer/editor/TimelineClips";
import { Timeline } from "../src/renderer/editor/Timeline";

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

describe("timeline playhead", () => {
  it("routes a direct drag gesture to the scrub handlers", () => {
    const onPointerDown = vi.fn();
    const onPointerMove = vi.fn();
    const onPointerUp = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(TimelinePlayhead, {
      playheadPercent: 50,
      currentTime: 5,
      color: "#fff",
      onPointerDown,
      onPointerMove,
      onPointerUp
    })));

    const playhead = host.querySelector<HTMLElement>("[data-timeline-playhead]");
    expect(playhead).not.toBeNull();
    playhead?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    playhead?.dispatchEvent(new Event("pointermove", { bubbles: true }));
    playhead?.dispatchEvent(new Event("pointerup", { bubbles: true }));

    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onPointerMove).toHaveBeenCalledOnce();
    expect(onPointerUp).toHaveBeenCalledOnce();
  });
});

describe("timeline trim handles", () => {
  it("route captured move and release events directly to the interaction controller", () => {
    const onTrimPointerDown = vi.fn((event: { stopPropagation: () => void }) => event.stopPropagation());
    const onInteractionPointerMove = vi.fn();
    const onInteractionPointerUp = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(TimelineClip, {
      clip: {
        id: "clip",
        item: { id: "image", name: "Still", url: "image.png", kind: "image", origin: "imported", track: "imported", duration: 5 },
        track: "video",
        lane: 0,
        start: 0,
        duration: 5,
        sourceStart: 0
      },
      timelineDuration: 5,
      selected: true,
      onSelect: vi.fn(),
      onTrimPointerDown,
      onMovePointerDown: vi.fn(),
      onInteractionPointerMove,
      onInteractionPointerUp
    })));

    const handle = host.querySelector<HTMLElement>("[data-trim-edge='start']");
    expect(handle).not.toBeNull();
    handle?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    handle?.dispatchEvent(new Event("pointermove", { bubbles: true }));
    handle?.dispatchEvent(new Event("pointerup", { bubbles: true }));

    expect(onTrimPointerDown).toHaveBeenCalledOnce();
    expect(onInteractionPointerMove).toHaveBeenCalledOnce();
    expect(onInteractionPointerUp).toHaveBeenCalledOnce();
  });
});

describe("persistent effect lanes", () => {
  function renderTimeline(input?: {
    empty?: boolean;
    activeTool?: "media" | "style";
    processing?: boolean;
    rangeSelection?: { start: number; end: number } | null;
  }) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const handler = vi.fn();

    flushSync(() => root?.render(createElement(Timeline, {
      bodyRef: createRef<HTMLDivElement>(),
      onResizePointerDown: handler,
      onResizePointerMove: handler,
      onResizePointerUp: handler,
      onResizeDoubleClick: handler,
      timelineZoom: 1,
      onZoomIn: handler,
      onZoomOut: handler,
      onZoomReset: handler,
      activeTool: input?.activeTool ?? "style",
      playing: false,
      scrubbing: false,
      currentTime: 0,
      currentFrame: 0,
      totalFrames: 600,
      playheadPercent: 0,
      renderDuration: 20,
      videoClips: [],
      audioTracks: [],
      audioLevels: {},
      zoomEffects: input?.empty ? [] : [{
        id: "zoom-1",
        start: 4,
        end: 8,
        speed: "medium",
        scale: 1.5,
        targetX: 50,
        targetY: 50
      }],
      speedEffects: input?.empty ? [] : [{
        id: "speed-1",
        start: 7,
        end: 11,
        rate: 2
      }],
      transitions: [],
      subtitles: input?.empty ? [] : [{
        id: "subtitle-1",
        start: 10,
        end: 15,
        text: "Always visible"
      }],
      subtitleProcessing: input?.processing ?? false,
      textOverlays: input?.empty ? [] : [{
        id: "text-1", start: 2, end: 6, text: "Title", x: 50, y: 25,
        size: 64, color: "#ffffff", weight: 700, animation: "pop"
      }],
      selectedSegmentId: null,
      selectedSegmentIds: [],
      rangeSelection: input?.rangeSelection ?? null,
      selectedZoomId: null,
      selectedSpeedId: null,
      selectedSubtitleId: null,
      selectedTextOverlayId: null,
      contextMenu: null,
      canSplitAtContextMenu: false,
      canSplitAtPlayhead: false,
      onTogglePlayback: handler,
      onSeekFrame: handler,
      onUndo: handler,
      onRedo: handler,
      onSplitAtPlayhead: handler,
      onDeleteSelected: handler,
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
      onBodyPointerDown: handler,
      onBodyPointerMove: handler,
      onBodyPointerUp: handler,
      onBodyContextMenu: handler,
      onBodyDragOver: handler,
      onBodyDrop: handler,
      onContextMenuSplit: handler,
      onContextMenuDelete: handler
    })));

    return host;
  }

  it("shows zoom, speed, subtitle, and text timing while another tool is active", () => {
    const host = renderTimeline({ activeTool: "style" });

    expect(host.querySelector('[data-timeline-track="Zoom"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Speed"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Subtitles"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Text"]')).not.toBeNull();

    const zoom = host.querySelector<HTMLElement>('[data-zoom-effect-id="zoom-1"]');
    const speed = host.querySelector<HTMLElement>('[data-speed-effect-id="speed-1"]');
    const subtitle = host.querySelector<HTMLElement>('[data-subtitle-id="subtitle-1"]');
    const text = host.querySelector<HTMLElement>('[data-text-overlay-clip-id="text-1"]');
    expect(zoom?.style.left).toBe("20%");
    expect(zoom?.style.width).toBe("20%");
    expect(speed?.style.left).toBe("35%");
    expect(speed?.style.width).toBe("20%");
    expect(subtitle?.style.left).toBe("50%");
    expect(subtitle?.style.width).toBe("25%");
    expect(text?.style.left).toBe("10%");
    expect(text?.style.width).toBe("20%");
  });

  it("keeps all effect lanes visible before effects or subtitles are added", () => {
    const host = renderTimeline({ activeTool: "media", empty: true });

    expect(host.querySelector('[data-timeline-track="Zoom"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Speed"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Subtitles"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Text"]')).not.toBeNull();
  });

  it("shows timeline feedback while subtitles are processing", () => {
    const host = renderTimeline({ empty: true, processing: true });
    expect(host.querySelector("[data-subtitle-processing]")).not.toBeNull();
  });

  it("paints a marked timeline time range", () => {
    const host = renderTimeline({ rangeSelection: { start: 4, end: 8 } });
    expect(host.querySelector("[data-timeline-range-selection]")).not.toBeNull();
  });
});
