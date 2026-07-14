/** Owns cancellable export lifetimes without coupling FFmpeg to Electron IPC. */
import type { ExportProgress } from "../shared/types";

export interface ExportJobControl {
  signal: AbortSignal;
  onProgress: (percent: number, message?: string) => void;
}

export class ExportJobRegistry {
  private readonly controllers = new Map<string, AbortController>();

  begin(jobId: string, publish: (progress: ExportProgress) => void): ExportJobControl {
    if (this.controllers.has(jobId)) {
      throw new Error("An export with this id is already running.");
    }
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    return {
      signal: controller.signal,
      onProgress: (percent, message = "Exporting video…") => publish({
        jobId,
        percent: Math.max(0, Math.min(100, percent)),
        message
      })
    };
  }

  cancel(jobId: string): boolean {
    const controller = this.controllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  finish(jobId: string): void {
    this.controllers.delete(jobId);
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
