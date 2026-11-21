import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMatrixPopupStore,
  type MatrixPopupOptions
} from "../src/renderer/popups/matrix-popup-store";

describe("matrix popup store", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("shows text-only popups with defaults and optional titles", () => {
    const store = createMatrixPopupStore({ now: () => 1000 });

    const textOnly = store.show({ text: "Recording started" });
    const titled = store.show({ title: "Export ready", text: "Saved to exports" });

    expect(store.getSnapshot()[0]).toMatchObject({
      id: textOnly,
      title: undefined,
      text: "Recording started",
      phase: "entering"
    });
    expect(store.getSnapshot()[1]).toMatchObject({
      id: titled,
      title: "Export ready",
      text: "Saved to exports"
    });
  });

  it("merges every visual option into the popup theme", () => {
    const store = createMatrixPopupStore({ now: () => 1000 });
    const options: MatrixPopupOptions = {
      text: "Custom",
      position: "top-center",
      durationMs: 0,
      accentColor: "#00ff88",
      backgroundColor: "rgba(0,0,0,0.9)",
      textColor: "#d0ffe0",
      fontFamily: "Courier New, monospace",
      fontSize: 18,
      fontWeight: 800,
      borderRadius: 2,
      padding: 20,
      width: 520,
      scanlines: false,
      closable: false,
      pauseOnHover: false
    };

    const id = store.show(options);
    const popup = store.getSnapshot().find((entry) => entry.id === id);

    expect(popup).toMatchObject(options);
    expect(popup?.durationMs).toBe(0);
  });

  it("plays the exit animation before removing a popup", () => {
    vi.useFakeTimers();
    const store = createMatrixPopupStore({ now: () => 1000, exitMs: 200 });
    const id = store.show({ text: "Bye" });

    store.dismiss(id);
    expect(store.getSnapshot()[0]?.phase).toBe("exiting");
    expect(store.getSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(200);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("keeps at most the configured number of visible popups", () => {
    vi.useFakeTimers();
    const store = createMatrixPopupStore({ now: () => 1000, maxVisible: 2 });
    store.show({ text: "one" });
    vi.advanceTimersByTime(1);
    store.show({ text: "two" });
    vi.advanceTimersByTime(1);
    store.show({ text: "three" });

    expect(store.getSnapshot().map((entry) => entry.text)).toEqual(["two", "three"]);
  });

  it("pauses and resumes the auto-dismiss timer on hover", () => {
    vi.useFakeTimers();
    let currentTime = 1000;
    const store = createMatrixPopupStore({ now: () => currentTime });
    const id = store.show({ text: "Hover me", durationMs: 1000, pauseOnHover: true });

    currentTime = 1200;
    store.pause(id);
    vi.advanceTimersByTime(500);
    expect(store.getSnapshot()).toHaveLength(1);

    store.resume(id);
    vi.advanceTimersByTime(799);
    expect(store.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()[0]?.phase).toBe("exiting");
  });

  it("notifies subscribers after show and dismiss", () => {
    const store = createMatrixPopupStore({ now: () => 1000 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const id = store.show({ text: "hello" });
    store.dismiss(id);
    unsubscribe();
    store.show({ text: "ignored" });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
