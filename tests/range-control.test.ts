// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RangeControl } from "../src/renderer/editor/controls";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("RangeControl", () => {
  it("shows smooth inset progress without dots and keeps a native slider", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onChange = vi.fn();

    await act(async () => {
      root?.render(createElement(RangeControl, {
        label: "Radius",
        min: 0,
        max: 500,
        value: 350,
        onChange
      }));
    });

    expect(host.querySelector<HTMLElement>("[data-range-fill]")?.style.width).toBe("70%");
    expect(host.querySelector("[data-range-smooth]")).not.toBeNull();
    expect(host.querySelectorAll("[data-range-marker]")).toHaveLength(0);
    expect(host.querySelector("[data-range-position]")).toBeNull();
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Radius"]');
    expect(slider?.type).toBe("range");

    await act(async () => {
      if (!slider) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "120");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(120);
  });
});
