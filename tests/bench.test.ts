import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  BENCH_SNAPSHOT_CHANNEL,
  configureBenchMode,
  isBenchMode,
  registerBenchIpc
} from "../src/main/bench";

describe("bench mode", () => {
  it("enables only the exact --bench flag in an unpackaged app", () => {
    expect(isBenchMode({ argv: ["electron", ".", "--bench"], isPackaged: false })).toBe(true);
    expect(isBenchMode({ argv: ["electron", ".", "--bench"], isPackaged: true })).toBe(false);
    expect(isBenchMode({ argv: ["electron", ".", "--bench=1"], isPackaged: false })).toBe(false);
    expect(isBenchMode({ argv: ["electron", ".", "--benching"], isPackaged: false })).toBe(false);
    expect(isBenchMode({ argv: ["electron", "."], isPackaged: false })).toBe(false);
  });

  it("overwrites an inherited environment flag", () => {
    const previous = process.env.OVC_BENCH_MODE;
    try {
      process.env.OVC_BENCH_MODE = "1";
      configureBenchMode(false);
      expect(process.env.OVC_BENCH_MODE).toBe("0");
      configureBenchMode(true);
      expect(process.env.OVC_BENCH_MODE).toBe("1");
    } finally {
      if (previous === undefined) delete process.env.OVC_BENCH_MODE;
      else process.env.OVC_BENCH_MODE = previous;
    }
  });
});

describe("bench IPC", () => {
  it("returns aggregate app memory and uptime only to the main renderer", () => {
    const listeners = new Map<string, (event: { sender: { id: number } }) => unknown>();
    const ipc = { handle: vi.fn((channel: string, listener: (event: { sender: { id: number } }) => unknown) => {
      listeners.set(channel, listener);
    }) };
    const getAppMetrics = vi.fn(() => [{ workingSetSize: 1024 }, { workingSetSize: 3072 }]);

    registerBenchIpc({
      enabled: true,
      ipc,
      getAppMetrics,
      getMainWebContentsId: () => 7,
      now: () => "2026-11-19T00:00:00.000Z",
      uptime: () => 42.5
    });

    const listener = listeners.get(BENCH_SNAPSHOT_CHANNEL);
    expect(listener).toBeDefined();
    expect(listener!({ sender: { id: 7 } })).toEqual({
      schemaVersion: 1,
      capturedAt: "2026-11-19T00:00:00.000Z",
      uptimeSeconds: 42.5,
      processCount: 2,
      workingSetMb: 4
    });

    getAppMetrics.mockClear();
    expect(() => listener!({ sender: { id: 8 } })).toThrow("Bench sender rejected.");
    expect(getAppMetrics).not.toHaveBeenCalled();
  });

  it("rejects every sender while the main window is unavailable", () => {
    const listeners = new Map<string, (event: { sender: { id: number } }) => unknown>();
    const ipc = { handle: vi.fn((channel: string, listener: (event: { sender: { id: number } }) => unknown) => {
      listeners.set(channel, listener);
    }) };
    registerBenchIpc({
      enabled: true,
      ipc,
      getAppMetrics: vi.fn(() => [{ workingSetSize: 1024 }]),
      getMainWebContentsId: () => -1,
      now: () => "unused",
      uptime: () => 0
    });
    const listener = listeners.get(BENCH_SNAPSHOT_CHANNEL)!;
    expect(() => listener({ sender: { id: 1 } })).toThrow("Bench sender rejected.");
    expect(() => listener({ sender: { id: 8 } })).toThrow("Bench sender rejected.");
  });

  it("reports zero when Electron supplies no process metrics", () => {
    const listeners = new Map<string, (event: { sender: { id: number } }) => unknown>();
    const ipc = { handle: vi.fn((channel: string, listener: (event: { sender: { id: number } }) => unknown) => {
      listeners.set(channel, listener);
    }) };
    registerBenchIpc({
      enabled: true,
      ipc,
      getAppMetrics: () => [],
      getMainWebContentsId: () => 7,
      now: () => "2026-11-19T00:00:00.000Z",
      uptime: () => 1
    });
    expect(listeners.get(BENCH_SNAPSHOT_CHANNEL)!({ sender: { id: 7 } })).toMatchObject({
      processCount: 0,
      workingSetMb: 0
    });
  });

  it("does not register the channel outside bench mode", () => {
    const ipc = { handle: vi.fn() };
    registerBenchIpc({
      enabled: false,
      ipc,
      getAppMetrics: vi.fn(),
      getMainWebContentsId: () => 7,
      now: () => "unused",
      uptime: () => 0
    });
    expect(ipc.handle).not.toHaveBeenCalled();
  });
});

describe("startup harness arguments", () => {
  for (const args of [["--samples", "0"], ["--samples", "1.5"], ["--settle=-1"]]) {
    it(`rejects ${args.join(" ")}`, () => {
      const result = spawnSync(process.execPath, ["scripts/bench/startup.mjs", ...args], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Usage: node scripts/bench/startup.mjs");
    });
  }
});
