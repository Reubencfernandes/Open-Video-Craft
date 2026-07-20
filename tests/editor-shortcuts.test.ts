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
  togglePlayback: () => void;
  deleteSelected: () => void;
  onMute: () => void;
}) {
  useEditorShortcuts({
    currentTime: 0,
    currentTimeRef: { current: 0 },
    selectedTimelineSegmentId: props.selectedTimelineSegmentId ?? null,
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

  it("routes Delete through the unified timeline selection", () => {
    const { callbacks } = renderHarness({
      hasTimelineRangeSelection: true
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));

    expect(callbacks.deleteSelected).toHaveBeenCalledOnce();
  });

  it("deletes a selected timeline region even while its button has focus", () => {
    const { callbacks, host } = renderHarness();
    const button = host.querySelector<HTMLButtonElement>("[data-mute]");
    button?.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete"
    });
    button?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.deleteSelected).toHaveBeenCalledOnce();
  });
});
