// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveCameraStyle
} from "../src/shared/editor-domain/timeline-visibility";
import { createTimelineMediaClips } from "../src/renderer/editor/timeline-utils";
import { resolvePreviewComposition } from "../src/renderer/editor/composition-layers";
import { useTimelineEditing } from "../src/renderer/editor/useTimelineEditing";
import { LayoutPanel } from "../src/renderer/editor/panels/LayoutPanel";
import type { TimelineSegment } from "../src/shared/editor-domain/types";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const projectStyle = { shape: "circle", border: "light" } as const;
const cameraFrame = { x: 72, y: 50, size: 24 };

describe("per-clip camera style", () => {
  it("keeps the project value for every property the clip leaves out", () => {
    expect(resolveCameraStyle({ shape: "square" }, projectStyle)).toEqual({
      shape: "square",
      border: "light"
    });
  });

  it("lets the clip override shape and border together", () => {
    expect(resolveCameraStyle({ shape: "rounded", border: "accent" }, projectStyle)).toEqual({
      shape: "rounded",
      border: "accent"
    });
  });

  it("uses the project style when the clip has no style of its own", () => {
    expect(resolveCameraStyle(undefined, projectStyle)).toEqual(projectStyle);
    expect(resolveCameraStyle({}, projectStyle)).toEqual(projectStyle);
  });
});

describe("clip camera style projection", () => {
  const cameraItem: EditorMediaItem = {
    id: "project:camera-2",
    name: "camera.webm",
    url: "ovc-media://camera",
    kind: "video",
    origin: "project",
    track: "camera",
    channel: 2,
    duration: 10
  };
  const screenItem: EditorMediaItem = {
    ...cameraItem,
    id: "project:screen",
    track: "screen",
    channel: undefined
  };
  const segments: TimelineSegment[] = [
    {
      id: "camera-clip",
      itemId: "project:camera-2",
      track: "video",
      lane: 1,
      start: 0,
      end: 4,
      sourceStart: 0,
      cameraStyle: { shape: "square", border: "none" }
    },
    { id: "plain-clip", itemId: "project:camera-2", track: "video", lane: 1, start: 4, end: 8, sourceStart: 4 }
  ];
  const mediaById = new Map<string, EditorMediaItem>([
    [cameraItem.id, cameraItem],
    [screenItem.id, screenItem]
  ]);

  it("carries the clip camera style onto the renderer clip", () => {
    const clips = createTimelineMediaClips(segments, mediaById);

    expect(clips[0]?.cameraStyle).toEqual({ shape: "square", border: "none" });
    expect(clips[1]?.cameraStyle).toBeUndefined();
  });

  function composition(
    clips: TimelineMediaClip[],
    time: number,
    styleOverrides: { cameraShape: "circle" | "rounded" | "square"; cameraBorderStyle: "none" | "light" | "accent" }
  ) {
    return resolvePreviewComposition({
      clips,
      time,
      projectLayout: "bubble",
      screenAspectRatio: "16:9",
      cameraFrame,
      projectCameraStyle: {
        shape: styleOverrides.cameraShape,
        border: styleOverrides.cameraBorderStyle
      }
    });
  }

  it("resolves the webcam clip style over the project style in the preview", () => {
    const clips = createTimelineMediaClips(segments, mediaById);
    const result = composition(clips, 2, { cameraShape: "circle", cameraBorderStyle: "light" });

    expect(result.cameraStyle).toEqual({ shape: "square", border: "none" });
  });

  it("falls back to the project style for a clip without its own style", () => {
    const clips = createTimelineMediaClips(segments, mediaById);
    const result = composition(clips, 6, { cameraShape: "circle", cameraBorderStyle: "accent" });

    expect(result.cameraStyle).toEqual({ shape: "circle", border: "accent" });
  });

  it("ignores a style saved on the screen clip because the webcam is styled", () => {
    const clips = createTimelineMediaClips(
      [{
        id: "screen-clip",
        itemId: "project:screen",
        track: "video",
        lane: 0,
        start: 0,
        end: 4,
        sourceStart: 0,
        cameraStyle: { border: "none", shape: "square" }
      }],
      mediaById
    );
    const result = composition(clips, 2, { cameraShape: "rounded", cameraBorderStyle: "light" });

    expect(result.cameraStyle).toEqual({ shape: "rounded", border: "light" });
  });
});

describe("per-clip camera style controls", () => {
  const selectionSegments: TimelineSegment[] = [
    { id: "camera-a", itemId: "project:camera", track: "video", lane: 1, start: 0, end: 2, sourceStart: 0 },
    { id: "camera-b", itemId: "project:camera", track: "video", lane: 1, start: 2, end: 4, sourceStart: 2 },
    { id: "music", itemId: "project:mic", track: "audio", lane: 0, start: 0, end: 4, sourceStart: 0 }
  ];

  async function renderEditing(selectedIds: string[], selectedId: string | null = null) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const api: {
      current: ReturnType<typeof useTimelineEditing> | null;
    } = { current: null };
    const committed: TimelineSegment[][] = [];

    function Harness() {
      const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>(selectionSegments);
      const [selectedTimelineSegmentIds] = useState<string[]>(selectedIds);
      const editing = useTimelineEditing({
        activeDuration: 0,
        allMedia: [],
        audioElsRef: { current: new Map() },
        getTimelineTimeFromClientX: () => null,
        isEditorStateReady: false,
        knownTimelineItemIdsRef: { current: new Set<string>() },
        mediaById: new Map(),
        mediaDurationById: new Map(),
        onDropNewTextOverlay: () => undefined,
        scheduleTimelinePlaybackSync: () => undefined,
        seek: () => undefined,
        selectedItemId: "project:camera",
        selectedTimelineItemId: null,
        selectedTimelineSegmentId: selectedId,
        selectedTimelineSegmentIds,
        setSelectedItemId: () => undefined,
        setSelectedTimelineSegmentId: () => undefined,
        setSelectedTimelineSegmentIds: () => undefined,
        setTimelineContextMenu: () => undefined,
        setTimelineRangeSelection: () => undefined,
        setTimelineSegments,
        setTimelineViewDuration: () => undefined,
        setTrimRange: () => undefined,
        timelineDuration: 0,
        timelineEditableItems: [],
        timelineRenderDuration: 4,
        timelineSegments,
        timelineViewDuration: 0,
        updateMediaDuration: () => undefined
      });
      api.current = editing;
      committed.push(timelineSegments);
      return createElement("div", null, null);
    }

    await act(async () => {
      root?.render(createElement(Harness));
    });
    return { api, latest: () => committed[committed.length - 1] };
  }

  function styleOf(segments: TimelineSegment[], id: string) {
    return segments.find((segment) => segment.id === id)?.cameraStyle;
  }

  it("applies the current camera style to the selected clips and clears it", async () => {
    const harness = await renderEditing(["camera-a", "camera-b", "music"]);

    await act(async () => {
      harness.api.current?.setSelectedClipsCameraStyle({ shape: "square", border: "accent" });
    });

    let segments = harness.latest();
    expect(styleOf(segments, "camera-a")).toEqual({ shape: "square", border: "accent" });
    expect(styleOf(segments, "camera-b")).toEqual({ shape: "square", border: "accent" });
    // An audio clip carries no picture, so it never gets a camera style.
    expect(styleOf(segments, "music")).toBeUndefined();

    await act(async () => {
      harness.api.current?.setSelectedClipsCameraStyle(null);
    });

    segments = harness.latest();
    expect(styleOf(segments, "camera-a")).toBeUndefined();
    expect("cameraStyle" in (segments[0] as object)).toBe(false);
    expect(styleOf(segments, "camera-b")).toBeUndefined();
  });

  it("applies the style to the focused clip when only one clip is selected", async () => {
    const harness = await renderEditing([], "camera-b");

    await act(async () => {
      harness.api.current?.setSelectedClipsCameraStyle({ border: "none" });
    });

    const segments = harness.latest();
    expect(styleOf(segments, "camera-b")).toEqual({ border: "none" });
    expect(styleOf(segments, "camera-a")).toBeUndefined();
  });

  it("keeps the per-clip layout buttons applying and clearing their own override", async () => {
    const harness = await renderEditing(["camera-a", "camera-b"]);

    await act(async () => {
      harness.api.current?.setSelectedClipsLayout("side-by-side", "bubble");
    });
    let segments = harness.latest();
    expect(segments.find((segment) => segment.id === "camera-a")?.layout).toBe("side-by-side");
    expect(segments.find((segment) => segment.id === "camera-b")?.layout).toBe("side-by-side");

    await act(async () => {
      harness.api.current?.setSelectedClipsLayout(null, "bubble");
    });
    segments = harness.latest();
    expect(segments.find((segment) => segment.id === "camera-a")?.layout).toBeUndefined();
  });

  it("forwards the per-clip camera style buttons to their handlers", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onApplyCameraStyleToClips = vi.fn();
    const onClearClipCameraStyle = vi.fn();

    await act(async () => {
      root?.render(createElement(LayoutPanel, {
        layoutMode: "bubble",
        screenScale: 100,
        screenCrop: { top: 0, right: 0, bottom: 0, left: 0 },
        cameraBackgroundStatus: { status: "idle", progress: 0, message: null },
        cameraMatteReady: false,
        onPrepareCameraBackground: () => undefined,
        onCancelCameraBackground: () => undefined,
        screenAspectRatio: "auto",
        screenAspectEnabled: true,
        cameraShape: "circle",
        cameraBorderStyle: "light",
        cameraContentTransform: { x: 0, y: 0, scale: 100, mirrored: false },
        cameraPosition: "bottom-right",
        cameraSize: 24,
        onLayoutModeChange: () => undefined,
        onScreenScaleChange: () => undefined,
        onScreenCropChange: () => undefined,
        onApplyLayoutToClips: () => undefined,
        onClearClipLayout: () => undefined,
        onApplyCameraStyleToClips,
        onClearClipCameraStyle,
        onScreenAspectRatioChange: () => undefined,
        onCameraShapeChange: () => undefined,
        onCameraBorderStyleChange: () => undefined,
        onCameraContentTransformChange: () => undefined,
        onCameraContentTransformReset: () => undefined,
        onCameraPositionChange: () => undefined,
        onCameraSizeChange: () => undefined
      }));
    });

    const apply = host.querySelector<HTMLButtonElement>("[data-apply-camera-style]");
    const clear = host.querySelector<HTMLButtonElement>("[data-clear-clip-camera-style]");
    expect(apply?.textContent).toBe("Apply style to selected");
    expect(clear?.textContent).toBe("Clear");

    await act(async () => {
      apply?.click();
      clear?.click();
    });

    expect(onApplyCameraStyleToClips).toHaveBeenCalledTimes(1);
    expect(onClearClipCameraStyle).toHaveBeenCalledTimes(1);
  });
});
