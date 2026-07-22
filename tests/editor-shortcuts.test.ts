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
  undo: () => void;
  redo: () => void;
}) {
  useEditorShortcuts({
    currentTime: 0,
    currentTimeRef: { current: 0 },
    selectedTimelineSegmentId: props.selectedTimelineSegmentId ?? null,
    hasTimelineRangeSelection: props.hasTimelineRangeSelection ?? false,
    seek: vi.fn(),
    undo: props.undo,
    redo: props.redo,
    openExport: vi.fn(),
    copyClip: vi.fn(),
    cutClip: vi.fn(),
    pasteClip: vi.fn(),
    splitAtPlayhead: vi.fn(),
    togglePlayback: props.togglePlayback,
    deleteSelected: props.deleteSelected
  });

  return createElement(
    "main",
    null,
    createElement("button", { type: "button", "data-layout-preset": true }, "Layout preset"),
    createElement("input", { "data-text-input": true }),
    createElement("textarea", { "data-textarea": true }),
    createElement(
      "div",
      { contentEditable: true, "data-contenteditable": true, suppressContentEditableWarning: true },
      createElement("span", { "data-contenteditable-child": true }, "Editable text")
    ),
    createElement(
      "div",
      { "data-timeline-body": true, tabIndex: 0 },
      createElement(
        "button",
        {
          type: "button",
          "data-mute": true,
          "data-timeline-audio-mute": "1",
          onClick: props.onMute
        },
        "Mute"
      ),
      createElement("button", { type: "button", "data-segment-id": "clip-1" }, "Clip")
    )
  );
}

function renderHarness(
  overrides: Partial<Parameters<typeof ShortcutHarness>[0]> = {}
) {
  const callbacks = {
    togglePlayback: vi.fn(),
    deleteSelected: vi.fn(),
    onMute: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides
  };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root?.render(createElement(ShortcutHarness, callbacks)));
  return { callbacks, host };
}

describe("editor global shortcuts", () => {
  it("leaves Cmd/Ctrl+Z and Y native in text inputs and contenteditable regions", () => {
    const { callbacks, host } = renderHarness();
    const targets = [
      host.querySelector<HTMLElement>("[data-text-input]"),
      host.querySelector<HTMLElement>("[data-textarea]"),
      host.querySelector<HTMLElement>("[data-contenteditable-child]")
    ];

    for (const target of targets) {
      for (const key of ["z", "y"]) {
        const event = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key
        });
        target?.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    }

    expect(callbacks.undo).not.toHaveBeenCalled();
    expect(callbacks.redo).not.toHaveBeenCalled();
  });

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

  it("toggles playback when a timeline clip button has focus", () => {
    const { callbacks, host } = renderHarness();
    const clip = host.querySelector<HTMLButtonElement>("[data-segment-id]");
    clip?.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " "
    });
    clip?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.togglePlayback).toHaveBeenCalledOnce();
  });

  it("toggles playback after a Layout preset button receives focus", () => {
    const { callbacks, host } = renderHarness();
    const preset = host.querySelector<HTMLButtonElement>("[data-layout-preset]");
    preset?.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " "
    });
    preset?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.togglePlayback).toHaveBeenCalledOnce();
  });

  it("toggles playback as a general editor shortcut", () => {
    const { callbacks } = renderHarness();

    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " "
    }));

    expect(callbacks.togglePlayback).toHaveBeenCalledOnce();
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
