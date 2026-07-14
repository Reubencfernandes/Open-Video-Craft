import { describe, expect, it } from "vitest";
import { ExportJobRegistry } from "../src/main/export-jobs";

describe("ExportJobRegistry", () => {
  it("publishes bounded progress and cancels an active job", () => {
    const registry = new ExportJobRegistry();
    const events: Array<{ jobId: string; percent: number; message: string }> = [];
    const control = registry.begin("job", (event) => events.push(event));
    control.onProgress(140, "Working");

    expect(events).toEqual([{ jobId: "job", percent: 100, message: "Working" }]);
    expect(control.signal.aborted).toBe(false);
    expect(registry.cancel("job")).toBe(true);
    expect(control.signal.aborted).toBe(true);
    registry.finish("job");
    expect(registry.cancel("job")).toBe(false);
  });
});
