// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessageBubble } from "../src/renderer/editor/panels/assistant/ChatMessageBubble";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ChatMessageBubble", () => {
  it("copies a sent user query and confirms the action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await act(async () => {
      root?.render(createElement(ChatMessageBubble, {
        message: {
          id: "user-message",
          role: "user",
          text: "Trim the beginning of my recording",
          createdAt: 1_700_000_000_000,
          editSummary: null,
          editId: null
        },
        onUndoEdit: () => undefined
      }));
    });

    const copyButton = host.querySelector<HTMLButtonElement>('button[aria-label="Copy sent query"]');
    expect(copyButton).not.toBeNull();

    await act(async () => copyButton?.click());

    expect(writeText).toHaveBeenCalledWith("Trim the beginning of my recording");
    expect(host.querySelector('button[aria-label="Sent query copied"]')?.textContent).toContain("Copied");
  });

  it("does not show the query copy action on assistant messages", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ChatMessageBubble, {
        message: {
          id: "assistant-message",
          role: "assistant",
          text: "Done.",
          createdAt: 1_700_000_000_000,
          editSummary: null,
          editId: null
        },
        onUndoEdit: () => undefined
      }));
    });

    expect(host.querySelector('button[aria-label="Copy sent query"]')).toBeNull();
  });
});
