// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenVideoCraftApi } from "../src/preload/preload";
import { useGeminiChat } from "../src/renderer/editor/useGeminiChat";

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
});
