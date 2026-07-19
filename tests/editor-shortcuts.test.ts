// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorShortcuts } from "../src/renderer/editor/useEditorShortcuts";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

function ShortcutHarness(props: {
  hasTimelineRangeSelection?: boolean;
  selectedTimelineSegmentId?: string | null;
  selectedZoomId?: string | null;
  togglePlayback: () => void;
  removeZoom: (id: string) => void;
  deleteSelected: () => void;
  onMute: () => void;
}) {
  useEditorShortcuts({
    activeTool: "zoom",
    currentTime: 0,
    currentTimeRef: { current: 0 },
    selectedTimelineSegmentId: props.selectedTimelineSegmentId ?? null,
    selectedZoomId: props.selectedZoomId ?? null,
    selectedSpeedId: null,
    hasTimelineRangeSelection: props.hasTimelineRangeSelection ?? false,
    seek: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    openExport: vi.fn(),
    copyClip: vi.fn(),
    cutClip: vi.fn(),
    pasteClip: vi.fn(),
    splitAtPlayhead: vi.fn(),
    togglePlayback: props.togglePlayback,
    removeZoom: props.removeZoom,
    removeSpeed: vi.fn(),
    deleteSelected: props.deleteSelected
  });

  return createElement(
    "button",
    { type: "button", "data-mute": true, onClick: props.onMute },
    "Mute"
  );
}

function renderHarness(
  overrides: Partial<Parameters<typeof ShortcutHarness>[0]> = {}
) {
  const callbacks = {
    togglePlayback: vi.fn(),
    removeZoom: vi.fn(),
    deleteSelected: vi.fn(),
    onMute: vi.fn(),
    ...overrides
  };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(ShortcutHarness, callbacks)));
  return { callbacks, host };
}

describe("editor global shortcuts", () => {
  it("leaves Space on a focused timeline mute button to native activation", () => {
    const { callbacks, host } = renderHarness();
    const button = host.querySelector<HTMLButtonElement>("[data-mute]");
    button?.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " "
    });
    button?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(callbacks.togglePlayback).not.toHaveBeenCalled();
    button?.click();
    expect(callbacks.onMute).toHaveBeenCalledOnce();
  });

  it("deletes the marquee selection before an old effect owned by the active tool", () => {
    const { callbacks } = renderHarness({
      hasTimelineRangeSelection: true,
      selectedZoomId: "old-zoom"
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));

    expect(callbacks.deleteSelected).toHaveBeenCalledOnce();
    expect(callbacks.removeZoom).not.toHaveBeenCalled();
  });
});
