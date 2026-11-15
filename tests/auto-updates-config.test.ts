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
});
