import { describe, expect, it } from "vitest";

import {
  FRAME_BUDGET,
  buildRendererReport,
  chooseDemuxCandidate,
  chooseMuxCandidate,
  enforceFrameBudget,
  packetsFromTimes,
  scheduleFrame,
  seekToFrame,
  stepSequence
} from "../src/shared/render/pipeline";
import { evaluateScene, frameStartTicks, ticksPerFrame } from "../src/shared/render/scene";
import type { RenderDocument } from "../src/shared/render/types";

const document: RenderDocument = {
  id: "S2",
  fpsNumerator: 30,
  fpsDenominator: 1,
  width: 1920,
  height: 1080,
  layers: [
    { kind: "background", id: "bg", color: "#101010" },
    {
      kind: "media",
      id: "screen",
      sourceId: "screen-2560x1600",
      sourceStartTicks: 0n,
      transform: { x: 0, y: 0, width: 1920, height: 1080, opacity: 1, rotationRadians: 0 },
      mask: { kind: "none", featherPx: 0 }
    },
    {
      kind: "media",
      id: "camera",
      sourceId: "camera-1080p",
      sourceStartTicks: 0n,
      transform: { x: 1400, y: 60, width: 420, height: 420, opacity: 1, rotationRadians: 0 },
      mask: { kind: "circle", featherPx: 2 },
      border: { widthPx: 3, color: "#ffffff", shadowBlurPx: 8 }
    },
    {
      kind: "text",
      id: "title",
      text: "Scene 2",
      fontPx: 36,
      color: "#ffffff",
      progress: 0.5,
      transform: { x: 40, y: 40, width: 400, height: 60, opacity: 1, rotationRadians: 0 }
    }
  ],
  crossfades: [{ layerId: "title", startTicks: 0n, durationTicks: 23_520_000n }],
  hdrPresent: false
};

describe("G2 scene evaluator", () => {
  it("evaluates one deterministic scene for S2 layers", () => {
    const first = evaluateScene(document, 0n);
    const second = evaluateScene(document, 0n);
    expect(first).toEqual(second);
    expect(first.colorSpace).toBe("srgb-bt709-sdr");
    expect(first.layers.map((layer) => layer.kind)).toEqual(["background", "media", "media", "text"]);
    expect(first.layers[2]?.mask.kind).toBe("circle");
    expect(first.layers[2]?.border?.widthPx).toBe(3);
  });

  it("refuses HDR instead of silently mis-rendering it", () => {
    expect(() => evaluateScene({ ...document, hdrPresent: true }, 0n)).toThrow("HDR_REFUSED");
  });

  it("computes exact frame boundaries from the timebase", () => {
    expect(ticksPerFrame(document)).toBe(23_520_000n);
    expect(frameStartTicks(document, 30)).toBe(705_600_000n);
    expect(() => frameStartTicks(document, -1)).toThrow("INVALID_FRAME");
  });
});

describe("G2 frame scheduling and deterministic checks", () => {
  const perFrame = ticksPerFrame(document);
  const packets = packetsFromTimes([0n, perFrame, perFrame * 2n, perFrame * 5n, perFrame * 6n, perFrame * 7n], 30);

  it("holds the latest VFR packet with PTS <= t", () => {
    expect(scheduleFrame(packets, 4, perFrame).sourceFrameIndex).toBe(2);
    expect(scheduleFrame(packets, 5, perFrame).sourceFrameIndex).toBe(3);
  });

  it("seeks cold to the preceding keyframe and discards earlier frames", () => {
    const decoded = seekToFrame(packets, 3);
    expect(decoded.map((packet) => packet.frameIndex)).toEqual([0, 1, 2, 3]);
  });

  it("steps monotonically without skipped or duplicated frames", () => {
    expect(stepSequence(packets, 0, 5)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("selects D1 and M1 first and records rejected candidates", () => {
    expect(chooseDemuxCandidate(true, true)).toBe("D1-indexed");
    expect(chooseDemuxCandidate(false, true)).toBe("D2-js-container");
    expect(chooseDemuxCandidate(false, false)).toBe("D3-ffmpeg-raw");
    expect(chooseMuxCandidate(true, true)).toBe("M1-ffmpeg-elementary");
    expect(chooseMuxCandidate(false, true)).toBe("M2-js-intermediate");
  });

  it("enforces the bounded frame budgets from R5", () => {
    expect(() => enforceFrameBudget(FRAME_BUDGET)).not.toThrow();
    expect(() => enforceFrameBudget({ ...FRAME_BUDGET, encodeQueueSize: 5 })).toThrow("FRAME_BUDGET_EXCEEDED");
  });

  it("returns PARTIAL with explicit external blockers", () => {
    const report = buildRendererReport([
      { id: "R1", status: "PASS", detail: "deterministic seek test passed locally" },
      { id: "R2", status: "PASS", detail: "frame stepping test passed locally" }
    ]);
    expect(report.verdict).toBe("PARTIAL");
    expect(report.checks.filter((check) => check.status === "BLOCKED_EXTERNAL").map((check) => check.id)).toContain("R6");
  });
});
