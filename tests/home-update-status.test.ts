// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../src/shared/types";
import { HomeUpdateStatus } from "../src/renderer/home/HomeUpdateStatus";

let root: ReturnType<typeof createRoot> | null = null;

function createStatus(
  state: UpdateStatus["state"],
  downloadProgress: number | null
): UpdateStatus {
  return {
    state,
    currentVersion: "1.0.2",
    latestVersion: "1.0.3",
    message: state === "downloaded" ? "Ready to install" : "Downloading",
    checkedAt: "2026-07-23T10:00:00.000Z",
    downloadProgress,
    isPackaged: true
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("HomeUpdateStatus", () => {
  it("shows one clean green download progress bar", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(HomeUpdateStatus, {
        status: createStatus("downloading", 42),
        onInstall: () => undefined
      }));
    });

    expect(host.textContent).toContain("Download in progress");
    expect(host.textContent).toContain("42% complete");
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("42");
    expect(host.querySelector<HTMLElement>(".home-update-progress-fill")?.style.width).toBe("42%");
    expect(host.querySelectorAll(".home-update-progress-fill")).toHaveLength(1);
  });

  it("collapses the progress card before spawning the rainbow Restart action", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onInstall = vi.fn();

    await act(async () => {
      root?.render(createElement(HomeUpdateStatus, {
        status: createStatus("downloading", 96),
        onInstall
      }));
    });
    await act(async () => {
      root?.render(createElement(HomeUpdateStatus, {
        status: createStatus("downloaded", 100),
        onInstall
      }));
    });

    expect(host.querySelector('[data-update-download-state="exiting"]')).not.toBeNull();
    expect(host.querySelector(".home-update-restart-button")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(280);
    });

    const restart = host.querySelector<HTMLButtonElement>(".home-update-restart-button");
    expect(host.querySelector("[data-update-download-state]")).toBeNull();
    expect(restart?.textContent).toContain("Restart");
    expect(restart?.closest(".home-update-restart-stage")).not.toBeNull();

    await act(async () => restart?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onInstall).toHaveBeenCalledOnce();
  });
});
