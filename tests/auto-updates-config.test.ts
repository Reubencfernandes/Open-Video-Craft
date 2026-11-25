import { beforeEach, describe, expect, it, vi } from "vitest";

const autoUpdaterMock = vi.hoisted(() => ({
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: true,
  autoRunAppAfterInstall: true,
  allowPrerelease: true,
  fullChangelog: true,
  on: vi.fn(),
  checkForUpdates: vi.fn(async () => null)
}));

vi.mock("electron", () => ({
  app: { isPackaged: true, once: vi.fn(), getVersion: () => "1.0.6" },
  BrowserWindow: { getAllWindows: () => [] }
}));
vi.mock("electron-updater", () => ({ autoUpdater: autoUpdaterMock }));
vi.mock("../src/main/security-scoped-resources", () => ({ isMacAppStoreBuild: () => false }));

describe("auto-update configuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  it("never downloads or installs updates automatically", async () => {
    const { startAutoUpdates, stopAutoUpdates } = await import("../src/main/auto-updates");
    startAutoUpdates();
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdaterMock.allowPrerelease).toBe(false);
    stopAutoUpdates?.();
    vi.useRealTimers();
  });

  it("does not check a private fork feed with no published releases", async () => {
    autoUpdaterMock.checkForUpdates.mockClear();
    const { startAutoUpdates, getAutoUpdateStatus, stopAutoUpdates } = await import("../src/main/auto-updates");
    startAutoUpdates();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(getAutoUpdateStatus().state).toBe("disabled");
    stopAutoUpdates?.();
    vi.useRealTimers();
  });
});
