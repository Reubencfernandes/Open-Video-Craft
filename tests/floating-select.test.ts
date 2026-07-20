// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloatingSelect } from "../src/renderer/editor/FloatingSelect";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("FloatingSelect", () => {
  it("opens the floating menu and selects an option", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onChange = vi.fn();

    await act(async () => {
      root?.render(createElement(FloatingSelect, {
        ariaLabel: "Model",
        value: "gemini",
        options: [
          { value: "gemini", label: "Gemini (cloud)" },
          { value: "cohere", label: "Cohere Transcribe (cloud)" }
        ],
        onChange
      }));
    });

    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Model"]');
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("select")).toBeNull();

    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");

    const cohere = [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes("Cohere")
    );
    await act(async () => cohere?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onChange).toHaveBeenCalledWith("cohere");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(FloatingSelect, {
        ariaLabel: "Language",
        value: "en",
        options: [{ value: "en", label: "English" }],
        onChange: () => undefined
      }));
    });

    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Language"]');
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});
