// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PreviewTransitionLayer } from "../src/renderer/editor/PreviewTransitionLayer";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function media(id: string): EditorMediaItem {
  return {
    id,
    name: `${id}.mp4`,
    url: `ovc-import://${id}`,
    kind: "video",
    origin: "imported",
    track: "imported",
    duration: 4
  };
}

function clip(id: string, start: number): TimelineMediaClip {
  return {
    id,
    item: media(id),
    track: "video",
    lane: 0,
    start,
    duration: 2,
    sourceStart: 0
  };
}

function render(progress: number) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root?.render(
      createElement(PreviewTransitionLayer, {
        from: clip("from", 0),
        to: clip("to", 2),
        type: "crossfade",
        progress,
        currentTime: 2,
        playing: false,
        cameraItem: null,
        screenStyle: {},
        cameraStyle: null,
        cameraVideoStyle: {},
        previewQuality: "high" as const,
        opaqueBackdrop: false
      })
    )
  );
  return host;
}

describe("fluid transition preview", () => {
  it("keeps the outgoing and incoming slots fixed across the cut", () => {
    for (const progress of [0.49, 0.51]) {
      const host = render(progress);
      const sides = host.querySelectorAll("[data-transition-side]");
      expect(sides).toHaveLength(2);
      const outgoing = host.querySelector('[data-transition-side="outgoing"] video');
      const incoming = host.querySelector('[data-transition-side="incoming"] video');
      expect(outgoing?.getAttribute("src")).toContain("from");
      expect(incoming?.getAttribute("src")).toContain("to");
      act(() => root?.unmount());
      root = null;
      document.body.innerHTML = "";
    }
  });
});
