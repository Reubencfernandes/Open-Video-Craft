import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fixturePlan } from "../scripts/bench/g2/fixtures.mjs";
import { selfTest } from "../scripts/bench/g2/run.mjs";
import { hasFaststartAtoms } from "../scripts/bench/g2/verify.mjs";

describe("G2 harness helpers", () => {
  it("builds a deterministic synthetic fixture plan", () => {
    const plan = fixturePlan();
    expect(plan.fps).toBe(30);
    expect(plan.video.codec).toBe("libx264");
    expect(plan.audio.rate).toBe(48_000);
  });

  it("passes its bounded self-test without hardware", () => {
    expect(selfTest()).toEqual({ status: "PASS", mode: "self-test", checks: 1 });
  });

  it("detects faststart atom order and rejects a stream without it", () => {
    const faststart = Buffer.concat([Buffer.from("ftypmoovmdat"), Buffer.alloc(16)]);
    const streaming = Buffer.concat([Buffer.from("ftypmdatmoov"), Buffer.alloc(16)]);
    expect(hasFaststartAtoms(faststart)).toBe(true);
    expect(hasFaststartAtoms(streaming)).toBe(false);
  });

  it("uses an OS temp directory, never the worktree, for scratch state", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "ovc-g2-unit-"));
    expect(scratch.startsWith(os.tmpdir())).toBe(true);
    expect(path.relative(process.cwd(), scratch).startsWith("..")).toBe(true);
  });
});
