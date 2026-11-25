// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineContextMenuView } from "../src/renderer/editor/TimelineChrome";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

describe("timeline clip volume menu", () => {
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

  it("edits volume from the clip context menu", () => {
    const onVolumeChange = vi.fn();
    const onFadeChange = vi.fn();
    act(() => {
      root.render(
        <TimelineContextMenuView
          x={10}
          y={20}
          canSplit
          canDelete
          volume={70}
          onVolumeChange={onVolumeChange}
          fadeIn={1}
          fadeOut={2}
          onFadeChange={onFadeChange}
          onSplit={() => undefined}
          onDelete={() => undefined}
        />
      );
    });
    const range = container.querySelector<HTMLInputElement>("input[aria-label='Clip volume']");
    expect(range).not.toBeNull();
    expect(range?.value).toBe("70");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(range as HTMLInputElement, "35");
      range?.dispatchEvent(new Event("input", { bubbles: true }));
      range?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onVolumeChange).toHaveBeenCalledWith(35);
    const fadeIn = container.querySelector<HTMLInputElement>("input[aria-label='Clip fade in']");
    const fadeOut = container.querySelector<HTMLInputElement>("input[aria-label='Clip fade out']");
    expect(fadeIn?.value).toBe("1");
    expect(fadeOut?.value).toBe("2");
  });
});
