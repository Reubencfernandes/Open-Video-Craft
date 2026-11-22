// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineClip } from "../src/renderer/editor/TimelineClips";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const item: EditorMediaItem = {
  id: "music",
  name: "AI music",
  url: "ovc-import://file/music",
  kind: "audio",
  origin: "imported",
  track: "imported",
  duration: 10
};
const clip: TimelineMediaClip = {
  id: "music-segment",
  item,
  track: "audio",
  lane: 0,
  start: 0,
  duration: 5,
  sourceStart: 0
};

describe("TimelineClip volume control", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("edits the clip volume without changing the clip geometry", () => {
    const onVolumeChange = vi.fn();
    const onMovePointerDown = vi.fn();
    act(() => {
      root.render(
        <TimelineClip
          clip={clip}
          timelineDuration={10}
          selected={false}
          audioLevel={{ volume: 70, muted: false }}
          onVolumeChange={onVolumeChange}
          onSelect={() => undefined}
          onTrimPointerDown={() => undefined}
          onMovePointerDown={onMovePointerDown}
          onInteractionPointerMove={undefined}
          onInteractionPointerUp={undefined}
        />
      );
    });

    const input = container.querySelector("input[aria-label='Volume for AI music']");
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).value).toBe("70");

    act(() => {
      const range = input as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(range, "35");
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onVolumeChange).toHaveBeenCalledWith(35);
    expect(onMovePointerDown).not.toHaveBeenCalled();
  });
});
