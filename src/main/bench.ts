import type { BrowserWindow } from "electron";
import type { BenchSnapshot } from "../shared/types";

export const BENCH_SNAPSHOT_CHANNEL = "bench:snapshot";

interface BenchIpc {
  handle(
    channel: string,
    listener: (event: { sender: { id: number } }) => BenchSnapshot
  ): void;
}

interface BenchMetric {
  workingSetSize: number;
}

interface RegisterBenchIpcOptions {
  enabled: boolean;
  ipc: BenchIpc;
  getAppMetrics: () => BenchMetric[];
  getMainWebContentsId: () => number;
  now: () => string;
  uptime: () => number;
}

export function isBenchMode(options: { argv: string[]; isPackaged: boolean }): boolean {
  return !options.isPackaged && options.argv.includes("--bench");
}

export function configureBenchMode(enabled: boolean): void {
  // The preload bridge is present only when the main process opted in. Always
  // overwrite the variable so a packaged launch cannot inherit bench access.
  process.env.OVC_BENCH_MODE = enabled ? "1" : "0";
}

export function registerBenchIpc(options: RegisterBenchIpcOptions): void {
  if (!options.enabled) return;

  options.ipc.handle(BENCH_SNAPSHOT_CHANNEL, (event): BenchSnapshot => {
    if (event.sender.id !== options.getMainWebContentsId()) {
      throw new Error("Bench sender rejected.");
    }
    const metrics = options.getAppMetrics();
    const workingSetKb = metrics.reduce((total, metric) => total + metric.workingSetSize, 0);
    return {
      schemaVersion: 1,
      capturedAt: options.now(),
      uptimeSeconds: options.uptime(),
      processCount: metrics.length,
      workingSetMb: workingSetKb / 1024
    };
  });
}

function isBenchSnapshot(value: unknown): value is BenchSnapshot {
  return typeof value === "object" && value !== null
    && "schemaVersion" in value && value.schemaVersion === 1
    && "capturedAt" in value && typeof value.capturedAt === "string"
    && "uptimeSeconds" in value && typeof value.uptimeSeconds === "number"
    && "processCount" in value && typeof value.processCount === "number"
    && "workingSetMb" in value && typeof value.workingSetMb === "number";
}

export function attachBenchInstrumentation(window: BrowserWindow, enabled: boolean): void {
  if (!enabled) return;

  let timer: NodeJS.Timeout | null = null;
  const capture = async (): Promise<void> => {
    if (window.isDestroyed()) return;
    try {
      const snapshot: unknown = await window.webContents.executeJavaScript("window.ovcBench?.snapshot()");
      if (!isBenchSnapshot(snapshot)) throw new Error("Bench snapshot is invalid.");
      process.stdout.write(`[bench:snapshot] ${JSON.stringify(snapshot)}\n`);
    } catch (error) {
      process.stderr.write(`[bench:error] ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };

  window.webContents.on("did-finish-load", () => {
    if (timer) return;
    void capture();
    timer = setInterval(() => void capture(), 1000);
    timer.unref();
  });
  window.on("closed", () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}
