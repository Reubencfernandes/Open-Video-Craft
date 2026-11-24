// @vitest-environment jsdom
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/renderer/editor/ExportDialog";
import { useModalDialog } from "../src/renderer/useModalDialog";

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

function Harness(props: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const ref = useModalDialog<HTMLDivElement>({
    open,
    onClose: () => {
      props.onClose();
      setOpen(false);
    }
  });
  return open
    ? createElement("div", { role: "dialog", "aria-modal": "true", ref, "data-dialog": true }, "Body")
    : null;
}

function press(key: string) {
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("modal dialogs", () => {
  it("take focus on open, close on Escape, and hand focus back", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(createElement(Harness, { onClose })));

    expect(document.activeElement).toBe(document.querySelector("[data-dialog]"));
    flushSync(() => press("Escape"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-dialog]")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the export dialog open on Escape while an export runs", () => {
    const onClose = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = (exporting: boolean) => flushSync(() => root?.render(createElement(ExportDialog, {
      exportFormat: "mp4",
      exportResolution: "source",
      exportSubtitleMode: "burn-in",
      exporting,
      exportProgress: null,
      hasSubtitles: false,
      onClose,
      onCancelExport: vi.fn(),
      onExport: vi.fn(),
      onFormatChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onSubtitleModeChange: vi.fn()
    })));

    render(true);
    press("Escape");
    expect(onClose).not.toHaveBeenCalled();
    render(false);
    press("Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
