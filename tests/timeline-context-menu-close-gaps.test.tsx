// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineContextMenuView } from "../src/renderer/editor/TimelineChrome";

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

function renderMenu(input?: { onCloseGaps?: () => void }) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() =>
    root?.render(
      createElement(TimelineContextMenuView, {
        x: 10,
        y: 10,
        canSplit: true,
        canDelete: true,
        onSplit: vi.fn(),
        onDelete: vi.fn(),
        onCloseGaps: input?.onCloseGaps
      })
    )
  );
  return host;
}

describe("timeline context menu", () => {
  it("offers a command that closes the gaps around the addressed clips", () => {
    const onCloseGaps = vi.fn();
    const host = renderMenu({ onCloseGaps });
    const item = host.querySelector<HTMLButtonElement>("[data-context-menu-close-gaps]");

    expect(item).not.toBeNull();
    item?.click();
    expect(onCloseGaps).toHaveBeenCalledOnce();
  });

  it("does not show the command when the timeline cannot close gaps", () => {
    const host = renderMenu();
    expect(host.querySelector("[data-context-menu-close-gaps]")).toBeNull();
  });
});
