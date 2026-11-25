// @vitest-environment jsdom
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PreviewVideo } from "../src/renderer/editor/PreviewVideo";

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;
const videoRef = createRef<HTMLVideoElement>();

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  document.body.innerHTML = "";
});

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

function renderSrc(src: string) {
  act(() => {
    root?.render(
      createElement(PreviewVideo, {
        quality: "high",
        videoRef,
        src,
        style: { opacity: 1 }
      })
    );
  });
}

function videos(): HTMLVideoElement[] {
  return Array.from(container?.querySelectorAll("video") ?? []);
}

function sources(): string[] {
  return videos()
    .map((video) => video.getAttribute("src"))
    .filter((src): src is string => Boolean(src));
}

describe("preview cut continuity", () => {
  it("keeps the previous clip on screen until the incoming clip has a frame", () => {
    mount();
    renderSrc("ovc-media://first.webm");
    expect(sources()).toEqual(["ovc-media://first.webm"]);

    renderSrc("ovc-media://second.webm");
    const [retained, incoming] = videos();
    expect(sources()).toEqual(["ovc-media://first.webm", "ovc-media://second.webm"]);
    expect(retained.style.opacity).not.toBe("0");
    expect(incoming.style.opacity).toBe("0");

    act(() => {
      incoming.dispatchEvent(new Event("loadeddata"));
    });
    expect(sources()).toEqual(["ovc-media://second.webm"]);
    const presented = videos().find(
      (video) => video.getAttribute("src") === "ovc-media://second.webm"
    );
    expect(presented?.style.opacity).not.toBe("0");
    expect(videoRef.current?.getAttribute("src")).toBe("ovc-media://second.webm");
  });

  it("waits for the pending seek before showing the incoming clip", () => {
    mount();
    renderSrc("ovc-media://first.webm");
    renderSrc("ovc-media://second.webm");
    const incoming = videos()[1];

    Object.defineProperty(incoming, "seeking", { configurable: true, value: true });
    act(() => {
      incoming.dispatchEvent(new Event("loadeddata"));
    });
    expect(sources()).toEqual(["ovc-media://first.webm", "ovc-media://second.webm"]);

    Object.defineProperty(incoming, "seeking", { configurable: true, value: false });
    act(() => {
      incoming.dispatchEvent(new Event("seeked"));
    });
    expect(sources()).toEqual(["ovc-media://second.webm"]);
  });

  it("does not disrupt a single clip with no cut", () => {
    mount();
    renderSrc("ovc-media://only.webm");
    expect(sources()).toEqual(["ovc-media://only.webm"]);
    expect(videoRef.current?.getAttribute("src")).toBe("ovc-media://only.webm");
  });
});
