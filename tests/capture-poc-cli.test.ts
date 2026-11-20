import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildBinary, runDryRun } from "../scripts/bench/g1/run.mjs";

describe("G1 capture PoC dry-run CLI", () => {
  it("emits protocol v1 events and an atomic v1 manifest without live capture", async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "ovc-g1-cli-test-"));
    const binary = await buildBinary();

    const report = await runDryRun({ out, duration: 3, binary });

    expect(report).toMatchObject({
      status: "PASS",
      mode: "dry-run",
      durationSeconds: 3,
      trackCount: 6,
      manifestVersion: 1,
      liveCaptureAttempted: false,
      hardwareGate: "BLOCKED_EXTERNAL"
    });
    expect(report.eventCount).toBeGreaterThan(10);

    const manifest = JSON.parse(await readFile(path.join(out, "capture-session.json"), "utf8")) as {
      manifestVersion: number;
      dryRun: boolean;
      tracks: readonly unknown[];
    };
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.dryRun).toBe(true);
    expect(manifest.tracks).toHaveLength(6);
  }, 120_000);
});
