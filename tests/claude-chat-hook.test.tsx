// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClaudeChat } from "../src/renderer/editor/useClaudeChat";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true
});

type ChatApi = {
  send: (request: {
    projectId: string;
    message: string;
    history?: readonly { role: "user" | "assistant"; text: string }[];
  }) => Promise<{ text: string; provider: "claude-max" }>;
  cancel: (projectId: string) => Promise<boolean>;
};

type HookState = {
  send: (message: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  messages: readonly { text: string }[];
  sending: boolean;
  chatError: string | null;
};

function HookProbe(props: { projectId: string; register: (state: HookState) => void }) {
  const chat = useClaudeChat({ projectId: props.projectId });
  props.register({
    send: (message) => chat.send(message),
    cancel: () => chat.cancel(),
    reset: () => chat.reset(),
    get messages() { return chat.messages; },
    get sending() { return chat.sending; },
    get chatError() { return chat.chatError; }
  });
  return null;
}

describe("useClaudeChat", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: HookState | null;
  const send = vi.fn<ChatApi["send"]>();
  const cancel = vi.fn<ChatApi["cancel"]>();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    state = null;
    send.mockReset();
    cancel.mockReset();
    Object.defineProperty(window, "openVideoCraft", {
      configurable: true,
      value: { claude: { send, cancel } }
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(projectId: string) {
    act(() => {
      root.render(
        <HookProbe
          projectId={projectId}
          register={(next) => {
            state = next;
          }}
        />
      );
    });
    return current();
  }

  function current(): HookState {
    if (state === null) throw new Error("hook was not mounted");
    return state;
  }

  it("adds the user message and Claude's answer through the public bridge", async () => {
    send.mockResolvedValue({ text: "Added three zooms.", provider: "claude-max" });
    const hook = mount("project-1");
    await act(async () => { await hook.send("Add zooms"); });
    expect(send).toHaveBeenCalledWith({ projectId: "project-1", message: "Add zooms", history: [] });
    expect(current().messages.map((message) => message.text)).toEqual(["Add zooms", "Added three zooms."]);
    expect(current().sending).toBe(false);
  });

  it("sends prior turns with a follow-up message", async () => {
    send
      .mockResolvedValueOnce({ text: "Added a blue callout.", provider: "claude-max" })
      .mockResolvedValueOnce({ text: "Made it rounded.", provider: "claude-max" });
    const hook = mount("project-1");
    await act(async () => { await hook.send("Add an informative box"); });
    await act(async () => { await hook.send("Make it rounded"); });
    expect(send).toHaveBeenLastCalledWith({
      projectId: "project-1",
      message: "Make it rounded",
      history: [
        { role: "user", text: "Add an informative box" },
        { role: "assistant", text: "Added a blue callout." }
      ]
    });
  });

  it("shows an error and removes the optimistic user message on failure", async () => {
    send.mockRejectedValue(new Error("Claude Max has reached its current usage limit."));
    const hook = mount("project-1");
    await act(async () => { await hook.send("Add zooms"); });
    expect(current().chatError).toContain("usage limit");
    expect(current().messages).toHaveLength(0);
  });

  it("calls the real cancel bridge and stops the UI state", () => {
    cancel.mockResolvedValue(true);
    const hook = mount("project-1");
    act(() => hook.cancel());
    expect(cancel).toHaveBeenCalledWith("project-1");
    expect(current().sending).toBe(false);
  });

  it("keeps messages scoped to the active project after a switch", async () => {
    send.mockImplementation(async ({ projectId }) => ({ text: `done:${projectId}`, provider: "claude-max" }));
    const hook = mount("project-1");
    await act(async () => { await hook.send("first"); });
    act(() => {
      root.render(
        <HookProbe
          projectId="project-2"
          register={(next) => {
            state = next;
          }}
        />
      );
    });
    await act(async () => { await current().send("second"); });
    expect(current().messages.map((message) => message.text)).toEqual(["second", "done:project-2"]);
  });
});
