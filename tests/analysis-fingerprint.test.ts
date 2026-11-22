import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createAnalysisFingerprintInput } from "../src/main/editor-analysis";

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

describe("analysis fingerprint input", () => {
  const project = {
    schemaVersion: 1 as const,
    appVersion: "1.0.6",
    id: "project-1",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "complete" as const,
    source: null,
    devices: { microphone: { enabled: false, deviceId: null, label: null }, camera: { enabled: false, deviceId: null, label: null } },
    tracks: {},
    durationMs: 10_000,
    startedAt: "2026-01-01T00:00:00.000Z",
    stoppedAt: "2026-01-01T00:00:10.000Z",
    error: null
  };
  const editor = {
    v: 2 as const,
    timelineSegments: [{ id: "seg-1", itemId: "clip", track: "video" as const, lane: 0, start: 0, end: 10, sourceStart: 0 }],
    zoomEffects: [], speedEffects: [], transitions: [], subtitles: [], textOverlays: [],
    subtitleLanguage: null, subtitleStyle: "clean" as const, layoutMode: "bubble" as const,
    backgroundStyle: "gradient-1" as const, activeBackgroundCategory: "gradient" as const,
    cameraSize: 24, cameraPosition: "bottom-right" as const, cameraShape: "circle" as const,
    cameraBorderStyle: "light" as const, cameraContentTransform: { x: 0, y: 0, scale: 100, mirrored: false },
    videoCornerStyle: "soft" as const, screenPosition: { x: 0, y: 0, scale: 100 },
    screenAspectRatio: "auto" as const, cameraFrame: { x: 72, y: 72, size: 24 },
    masterVolume: 100, audioLevels: {}, backgroundAudioIds: [], customBackgroundImportId: null,
    trimRange: { start: 0, end: 10 }
  };

  it("changes when a speed effect is added to a different clip", () => {
    const before = createAnalysisFingerprintInput(project, editor, []);
    const after = createAnalysisFingerprintInput(project, editor, [
      { id: "speed-2", start: 2, end: 4, rate: 1.5 }
    ]);
    expect(sha(after)).not.toBe(sha(before));
  });

  it("remains stable for the same timeline state", () => {
    expect(createAnalysisFingerprintInput(project, editor, [])).toBe(createAnalysisFingerprintInput(project, editor, []));
  });
});
