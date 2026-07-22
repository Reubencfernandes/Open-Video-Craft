// @vitest-environment jsdom
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TimelinePlayhead, TimelineRuler } from "../src/renderer/editor/TimelineChrome";
import { TimelineClip } from "../src/renderer/editor/TimelineClips";
import { Timeline } from "../src/renderer/editor/Timeline";
import {
  getTimelineDurationAfterDrag,
  getTimelineZoomAfterWheel
} from "../src/renderer/editor/useTimelineViewport";
import type {
  EditorMediaItem,
  TimelineMediaClip,
  TimelineRangeSelection
} from "../src/renderer/editor/types";

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

describe("timeline ruler", () => {
  it("positions the final timestamp at the true end of the ruler", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(TimelineRuler, { duration: 67.5 })));

    const ticks = host.querySelectorAll<HTMLElement>("[data-timeline-ruler-tick]");
    expect(ticks).toHaveLength(6);
    expect(ticks[0]?.style.left).toBe("0%");
    expect(ticks[5]?.style.left).toBe("100%");
    expect(ticks[5]?.textContent).toBe("01:07");
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
    const selectedClip = host.querySelector<HTMLElement>("[data-segment-id='clip']");
    expect(handle).not.toBeNull();
    expect(selectedClip?.className).toContain("border-2");
    expect(selectedClip?.className).toContain("border-[#ff4b93]");
    expect(selectedClip?.className).toContain("after:bg-[#ff4b93]/10");
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
    processingRanges?: Array<{ start: number; end: number }>;
    rangeSelection?: TimelineRangeSelection | null;
    selectedZoomId?: string | null;
    onDeleteSelected?: () => void;
    audio?: boolean;
    audioLevels?: Record<string, { volume: number; muted: boolean }>;
    onSetAudioLevel?: (
      itemId: string,
      patch: Partial<{ volume: number; muted: boolean }>
    ) => void;
  }) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const handler = vi.fn();
    const sharedAudioItem: EditorMediaItem = {
      id: "audio-source-a",
      name: "Voice",
      url: "voice.wav",
      kind: "audio",
      origin: "imported",
      track: "imported",
      duration: 8
    };
    const secondAudioItem: EditorMediaItem = {
      ...sharedAudioItem,
      id: "audio-source-b",
      name: "Music",
      url: "music.wav"
    };
    const audioClips: TimelineMediaClip[] = input?.audio
      ? [
          {
            id: "audio-clip-a-1",
            item: sharedAudioItem,
            track: "audio",
            lane: 1,
            start: 0,
            duration: 2,
            sourceStart: 0
          },
          {
            id: "audio-clip-a-2",
            item: sharedAudioItem,
            track: "audio",
            lane: 1,
            start: 3,
            duration: 2,
            sourceStart: 2
          },
          {
            id: "audio-clip-b",
            item: secondAudioItem,
            track: "audio",
            lane: 1,
            start: 6,
            duration: 2,
            sourceStart: 0
          }
        ]
      : [];

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
      onZoomWheel: handler,
      onRulerPointerDown: handler,
      onRulerPointerMove: handler,
      onRulerPointerUp: handler,
      onRulerPointerCancel: handler,
      onRulerContract: handler,
      onRulerExpand: handler,
      onRulerReset: handler,
      activeTool: input?.activeTool ?? "style",
      playing: false,
      scrubbing: false,
      currentTime: 0,
      currentFrame: 0,
      totalFrames: 600,
      playheadPercent: 0,
      contentDuration: 12,
      renderDuration: 20,
      videoClips: [],
      audioTracks: input?.audio ? [{ lane: 1, clips: audioClips }] : [],
      audioLevels: input?.audioLevels ?? {},
      onSetAudioLevel: input?.onSetAudioLevel ?? handler,
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
      subtitleProcessingRanges: input?.processingRanges,
      textOverlays: input?.empty ? [] : [{
        id: "text-1", start: 2, end: 6, text: "Title", x: 50, y: 25,
        size: 64, color: "#ffffff", weight: 700, animation: "pop"
      }],
      selectedSegmentId: null,
      selectedSegmentIds: [],
      rangeSelection: input?.rangeSelection ?? null,
      selectedZoomId: input?.selectedZoomId ?? null,
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
      onDeleteSelected: input?.onDeleteSelected ?? handler,
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
    expect(zoom?.className).toContain("cursor-move");
  });

  it("enables toolbar deletion for a singular zoom selection", () => {
    const onDeleteSelected = vi.fn();
    const host = renderTimeline({ selectedZoomId: "zoom-1", onDeleteSelected });
    const deleteButton = host.querySelector<HTMLButtonElement>(
      'button[title="Delete selected timeline items"]'
    );

    expect(deleteButton?.disabled).toBe(false);
    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDeleteSelected).toHaveBeenCalledOnce();
  });

  it("exposes mouse resizing and wheel/pinch timeline zoom", () => {
    const host = renderTimeline();
    expect(host.querySelector("[data-timeline-resize-handle]")).not.toBeNull();
    expect(host.querySelector("[data-timeline-body]")?.hasAttribute("tabindex")).toBe(false);
    expect(host.querySelector("[data-timeline-zoom-viewport]")?.getAttribute("title"))
      .toContain("Ctrl/Cmd");
    expect(getTimelineZoomAfterWheel(1, -120)).toBeGreaterThan(1);
    expect(getTimelineZoomAfterWheel(2, 120)).toBeLessThan(2);
    expect(getTimelineZoomAfterWheel(10, -1000)).toBe(10);
    expect(getTimelineZoomAfterWheel(1, 1000)).toBe(1);
  });

  it("expands and compresses the time ruler with a horizontal drag", () => {
    expect(getTimelineDurationAfterDrag(60, 120, 30)).toBeGreaterThan(60);
    expect(getTimelineDurationAfterDrag(60, -120, 30)).toBeLessThan(60);
    expect(getTimelineDurationAfterDrag(60, -1000, 30)).toBe(30);
    expect(getTimelineDurationAfterDrag(60, 1000, 30)).toBe(630);

    const host = renderTimeline();
    const ruler = host.querySelector('[aria-label="Visible timeline duration"]');
    expect(ruler?.getAttribute("aria-valuemin")).toBe("12");
    expect(ruler?.getAttribute("aria-valuenow")).toBe("20");
  });

  it("keeps all effect lanes visible before effects or subtitles are added", () => {
    const host = renderTimeline({ activeTool: "media", empty: true });

    expect(host.querySelector('[data-timeline-track="Zoom"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Speed"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Subtitles"]')).not.toBeNull();
    expect(host.querySelector('[data-timeline-track="Text"]')).not.toBeNull();
  });

  it("shows timeline feedback while subtitles are processing", () => {
    const host = renderTimeline({
      empty: true,
      processing: true,
      processingRanges: [
        { start: 2, end: 5 },
        { start: 10, end: 12 }
      ]
    });
    const generation = host.querySelector("[data-subtitle-generation]");
    const ranges = host.querySelectorAll<HTMLElement>("[data-subtitle-generation-range]");
    expect(generation).not.toBeNull();
    expect(generation?.getAttribute("aria-label")).toBe("Generating subtitles");
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.style.left).toBe("10%");
    expect(ranges[0]?.style.width).toBe("15%");
    expect(ranges[1]?.style.left).toBe("50%");
    expect(ranges[1]?.style.width).toBe("10%");
    expect(generation?.textContent).not.toContain("%");
    expect(generation?.className).not.toContain("timeline-subtitle-shimmer");
    expect(host.querySelector("[data-subtitle-id]")).toBeNull();
  });

  it("hides the drag rectangle after release and highlights the selected items", () => {
    const host = renderTimeline({
      rangeSelection: { start: 4, end: 8, laneIds: ["speed", "subtitles"] }
    });
    expect(host.querySelector("[data-timeline-body]")?.className).toContain("cursor-default");
    expect(host.querySelector("[data-timeline-body]")?.className).not.toContain("cursor-crosshair");
    expect(host.querySelector("[data-timeline-range-selection]")).toBeNull();
    expect(host.querySelector("[data-timeline-range-count]")).toBeNull();
    expect(
      host.querySelector('[data-speed-effect-id="speed-1"]')?.classList.contains("outline")
    ).toBe(true);
    expect(
      host
        .querySelector('[data-speed-effect-id="speed-1"]')
        ?.classList.contains("outline-pink-200")
    ).toBe(true);
    expect(
      host.querySelector('[data-subtitle-id="subtitle-1"]')?.classList.contains("outline")
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>('button[title="Delete selected timeline items"]')?.disabled
    ).toBe(false);
  });

  it("shows one pink rectangle without item outlines while the pointer is dragging", () => {
    const host = renderTimeline({
      rangeSelection: {
        start: 4,
        end: 8,
        laneIds: ["speed", "subtitles"],
        dragging: true
      }
    });
    const selection = host.querySelector<HTMLElement>("[data-timeline-range-selection]");
    const selectionFrame = selection?.parentElement?.parentElement;
    expect(host.querySelector("[data-timeline-body]")?.className).toContain("cursor-crosshair");
    expect(host.querySelector("[data-timeline-body]")?.className).not.toContain("cursor-default");
    expect(host.querySelectorAll("[data-timeline-range-selection]")).toHaveLength(1);
    expect(selection?.dataset.timelineRangeLanes).toBe("speed,subtitles");
    expect(selection?.dataset.timelineRangeDragging).toBe("true");
    expect(selection?.className).toContain("bg-pink-400/[0.16]");
    expect(selection?.style.left).toBe("20%");
    expect(selection?.style.width).toBe("20%");
    expect(selectionFrame?.style.top).toBe("5.5rem");
    expect(selectionFrame?.style.height).toBe("5.25rem");
    expect(host.querySelector("[data-timeline-range-count]")?.textContent).toBe("1 item");
    expect(
      host.querySelector('[data-speed-effect-id="speed-1"]')?.classList.contains("outline")
    ).toBe(false);
  });

  it("persists mute on the audio lane rather than every reused source", () => {
    const onSetAudioLevel = vi.fn();
    const host = renderTimeline({ audio: true, onSetAudioLevel });
    const button = host.querySelector<HTMLButtonElement>('[data-timeline-audio-mute="1"]');

    expect(button?.getAttribute("aria-label")).toBe("Mute Audio 2");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetAudioLevel).toHaveBeenCalledOnce();
    expect(onSetAudioLevel).toHaveBeenCalledWith("audio-lane:1", { muted: true });
  });

  it("exposes inherited per-source mute as a mixed lane state", () => {
    const onSetAudioLevel = vi.fn();
    const host = renderTimeline({
      audio: true,
      audioLevels: {
        "audio-source-a": { volume: 100, muted: true },
        "audio-source-b": { volume: 80, muted: false }
      },
      onSetAudioLevel
    });
    const button = host.querySelector<HTMLButtonElement>('[data-timeline-audio-mute="1"]');

    expect(button?.getAttribute("aria-label")).toBe("Mute Audio 2");
    expect(button?.getAttribute("aria-pressed")).toBe("mixed");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetAudioLevel).toHaveBeenCalledWith("audio-lane:1", { muted: true });
  });

  it("offers to unmute a lane muted by its own persisted control", () => {
    const onSetAudioLevel = vi.fn();
    const host = renderTimeline({
      audio: true,
      audioLevels: { "audio-lane:1": { volume: 100, muted: true } },
      onSetAudioLevel
    });
    const button = host.querySelector<HTMLButtonElement>('[data-timeline-audio-mute="1"]');

    expect(button?.getAttribute("aria-label")).toBe("Unmute Audio 2");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetAudioLevel).toHaveBeenCalledWith("audio-lane:1", { muted: false });
  });
});
