// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeyCard } from "../src/renderer/editor/ApiKeyCard";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ApiKeyCard", () => {
  it("reveals a saved key only on request and keeps it editable", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onReveal = vi.fn(async () => "gemini-test-secret");
    const onSave = vi.fn(async () => undefined);

    await act(async () => {
      root?.render(createElement(ApiKeyCard, {
        title: "Google Gemini",
        description: "AI assistant",
        hasKey: true,
        keyUrl: "https://example.com",
        keyUrlLabel: "Get a key",
        disabled: false,
        onReveal,
        onSave,
        onClear: async () => undefined
      }));
    });

    expect(host.querySelector('input[aria-label="Google Gemini API key"]')).toBeNull();
    expect(host.innerHTML).not.toMatch(/violet|purple/i);

    const reveal = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Update")
    );
    await act(async () => reveal?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onReveal).toHaveBeenCalledOnce();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Google Gemini API key"]');
    expect(input?.type).toBe("text");
    expect(input?.value).toBe("gemini-test-secret");
    expect(host.querySelector('[aria-label="Hide Google Gemini API key"]')).not.toBeNull();

    const update = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Update key")
    );
    await act(async () => update?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSave).toHaveBeenCalledWith("gemini-test-secret");
    expect(host.querySelector('input[aria-label="Google Gemini API key"]')).toBeNull();
  });

  it("keeps a revealed key available when an update fails", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ApiKeyCard, {
        title: "Google Gemini",
        description: "AI assistant",
        hasKey: true,
        keyUrl: "https://example.com",
        keyUrlLabel: "Get a key",
        disabled: false,
        onReveal: async () => "retry-this-key",
        onSave: async () => { throw new Error("Save failed"); },
        onClear: async () => undefined
      }));
    });

    const buttons = () => [...host.querySelectorAll("button")];
    await act(async () => buttons().find((button) => button.textContent?.includes("Update"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => buttons().find((button) => button.textContent?.includes("Update key"))
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Google Gemini API key"]');
    expect(input?.value).toBe("retry-this-key");
    expect(input?.type).toBe("text");
  });
});
