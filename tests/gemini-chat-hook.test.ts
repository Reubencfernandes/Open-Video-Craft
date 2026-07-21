// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenVideoCraftApi } from "../src/preload/preload";
import {
  formatGeminiChatError,
  useGeminiChat
} from "../src/renderer/editor/useGeminiChat";

type ChatState = ReturnType<typeof useGeminiChat>;

let root: ReturnType<typeof createRoot> | null = null;
let chatState: ChatState | null = null;

function Harness(props: { projectId: string | null }) {
  chatState = useGeminiChat({ projectId: props.projectId });
  return null;
}

function installGeminiBridge(input?: {
  send?: OpenVideoCraftApi["gemini"]["send"];
}) {
  const gemini = {
    send: input?.send ?? vi.fn(async () => []),
    cancel: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    getHistory: vi.fn(async () => []),
    onUpdate: vi.fn(() => () => undefined)
  } satisfies OpenVideoCraftApi["gemini"];
  Object.defineProperty(window, "openVideoCraft", {
    configurable: true,
    value: { gemini } as unknown as OpenVideoCraftApi
  });
  return gemini;
}

async function renderProject(projectId: string | null) {
  await act(async () => {
    root?.render(createElement(Harness, { projectId }));
  });
}

beforeEach(() => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  chatState = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useGeminiChat project lifecycle", () => {
  it("cancels active work when switching projects", async () => {
    const neverFinishes = new Promise<[]>(() => undefined);
    const gemini = installGeminiBridge({ send: vi.fn(() => neverFinishes) });
    await renderProject("project-a");

    act(() => {
      void chatState?.send("Edit this project");
    });
    expect(gemini.send).toHaveBeenCalledOnce();

    await renderProject("project-b");

    expect(gemini.cancel).toHaveBeenCalledOnce();
    expect(gemini.cancel).toHaveBeenCalledWith("project-a");
  });

  it("cancels active work when the editor unmounts", async () => {
    const neverFinishes = new Promise<[]>(() => undefined);
    const gemini = installGeminiBridge({ send: vi.fn(() => neverFinishes) });
    await renderProject("project-a");

    act(() => {
      void chatState?.send("Edit this project");
    });
    await act(async () => root?.unmount());
    root = null;

    expect(gemini.cancel).toHaveBeenCalledOnce();
    expect(gemini.cancel).toHaveBeenCalledWith("project-a");
  });

  it("does not cancel a completed session when switching projects", async () => {
    const gemini = installGeminiBridge();
    await renderProject("project-a");

    await act(async () => {
      await chatState?.send("Just answer this");
    });
    expect(gemini.send).toHaveBeenCalledOnce();

    await renderProject("project-b");

    expect(gemini.cancel).not.toHaveBeenCalled();
  });

  it("includes the project video automatically with every chat request", async () => {
    const gemini = installGeminiBridge();
    await renderProject("project-a");

    await act(async () => {
      await chatState?.send("Fix the pacing");
    });

    expect(gemini.send).toHaveBeenCalledWith({
      projectId: "project-a",
      message: "Fix the pacing",
      includeVideo: true
    });
  });
});

describe("formatGeminiChatError", () => {
  it("turns a raw Electron-wrapped Gemini 503 response into a useful message", () => {
    const raw = new Error(
      `Error invoking remote method 'gemini:chat-send': Error: Gemini request failed (HTTP 503). { "error": { "code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }`
    );

    const message = formatGeminiChatError(raw);

    expect(message).toBe(
      "Gemini is temporarily unavailable because of high demand. Wait a moment and try again."
    );
    expect(message).not.toMatch(/remote method|\{\s*"error"|HTTP 503/);
  });

  it("explains when a previous request is still active", () => {
    expect(formatGeminiChatError(
      "Error invoking remote method 'gemini:chat-send': Error: The assistant is still working on the previous message."
    )).toBe(
      "Gemini is still completing the previous request. Wait for it to finish or stop it before trying again."
    );
  });
});
