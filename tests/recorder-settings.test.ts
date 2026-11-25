import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecorderSettingsStore } from "../src/main/recorder-settings";
import {
  cameraQualityIds,
  createDefaultRecorderSettings,
  parseRecorderSettings,
  reconcileRecorderSettings,
  screenQualityIds,
  type RecorderSettings
} from "../src/shared/recorder-settings";

const devices = {
  sources: [
    { id: "screen:0:0", kind: "screen" as const },
    { id: "screen:1:0", kind: "screen" as const },
    { id: "window:9:0", kind: "window" as const }
  ],
  cameras: [{ deviceId: "camera-1" }, { deviceId: "camera-2" }],
  microphones: [{ deviceId: "mic-1" }, { deviceId: "mic-2" }]
};

function storedSettings(overrides: Partial<RecorderSettings> = {}): RecorderSettings {
  return {
    schemaVersion: 1,
    sourceIds: ["screen:1:0"],
    cameraIds: ["camera-2"],
    micId: "mic-2",
    micEnabled: true,
    cameraEnabled: true,
    systemAudioEnabled: true,
    screenQuality: "1440p",
    cameraQuality: "720p",
    ...overrides
  };
}

describe("createDefaultRecorderSettings", () => {
  it("selects every screen and webcam at maximum quality on a genuine first run", () => {
    const settings = createDefaultRecorderSettings(devices);

    expect(settings).toEqual({
      schemaVersion: 1,
      sourceIds: ["screen:0:0", "screen:1:0"],
      cameraIds: ["camera-1", "camera-2"],
      micId: "mic-1",
      micEnabled: true,
      cameraEnabled: true,
      systemAudioEnabled: false,
      screenQuality: "source",
      cameraQuality: "1080p"
    });
    expect(screenQualityIds[0]).toBe("source");
    expect(cameraQualityIds[0]).toBe("1080p");
    expect(settings.screenQuality).toBe(screenQualityIds[0]);
    expect(settings.cameraQuality).toBe(cameraQualityIds[0]);
  });

  it("does not auto-select windows and leaves capture kinds without devices disabled", () => {
    const settings = createDefaultRecorderSettings({
      sources: [{ id: "window:7:0", kind: "window" }],
      cameras: [],
      microphones: []
    });

    expect(settings.sourceIds).toEqual([]);
    expect(settings.cameraIds).toEqual([]);
    expect(settings.micId).toBeNull();
    expect(settings.micEnabled).toBe(false);
    expect(settings.cameraEnabled).toBe(false);
  });
});

describe("reconcileRecorderSettings", () => {
  it("keeps stored selections that still exist and drops the rest", () => {
    const reconciled = reconcileRecorderSettings(
      storedSettings({
        sourceIds: ["screen:1:0", "window:9:0", "screen:gone"],
        cameraIds: ["camera-2", "camera-gone"]
      }),
      devices
    );

    expect(reconciled.sourceIds).toEqual(["screen:1:0", "window:9:0"]);
    expect(reconciled.cameraIds).toEqual(["camera-2"]);
    expect(reconciled.micId).toBe("mic-2");
    expect(reconciled.micEnabled).toBe(true);
    expect(reconciled.cameraEnabled).toBe(true);
    expect(reconciled.screenQuality).toBe("1440p");
    expect(reconciled.cameraQuality).toBe("720p");
  });

  it("falls back to the remaining microphone and disables kinds with no device", () => {
    const reconciled = reconcileRecorderSettings(
      storedSettings({
        sourceIds: ["screen:gone"],
        cameraIds: ["camera-gone"],
        micId: "mic-gone"
      }),
      devices
    );

    expect(reconciled.sourceIds).toEqual([]);
    expect(reconciled.cameraIds).toEqual([]);
    expect(reconciled.cameraEnabled).toBe(false);
    expect(reconciled.micId).toBe("mic-1");

    const empty = reconcileRecorderSettings(storedSettings(), {
      sources: [],
      cameras: [],
      microphones: []
    });

    expect(empty.micId).toBeNull();
    expect(empty.micEnabled).toBe(false);
    expect(empty.cameraEnabled).toBe(false);
  });
});

describe("parseRecorderSettings", () => {
  it("accepts the persisted file shape", () => {
    expect(parseRecorderSettings(storedSettings())).toEqual(storedSettings());
  });

  it("rejects an unknown schema, quality or id shape", () => {
    expect(parseRecorderSettings(null)).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), schemaVersion: 2 })).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), screenQuality: "4k" })).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), cameraQuality: "source" })).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), sourceIds: [1] })).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), micId: 42 })).toBeNull();
    expect(parseRecorderSettings({ ...storedSettings(), micEnabled: "yes" })).toBeNull();
  });
});

describe("RecorderSettingsStore", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-recorder-settings-"));
    filePath = path.join(tmpDir, "recorder-settings.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reports a genuine first run when nothing was saved yet", async () => {
    await expect(new RecorderSettingsStore(filePath).read()).resolves.toBeNull();
  });

  it("persists the app-level selection in userData", async () => {
    const store = new RecorderSettingsStore(filePath);
    const settings = createDefaultRecorderSettings(devices);

    await expect(store.write(settings)).resolves.toEqual(settings);
    await expect(store.read()).resolves.toEqual(settings);

    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(raw).toEqual(settings);
  });

  it("refuses to persist an invalid payload", async () => {
    const store = new RecorderSettingsStore(filePath);

    await expect(store.write({ schemaVersion: 1, sourceIds: ["screen:0:0"] }))
      .rejects.toThrow(/Invalid recorder settings/);
    await expect(fs.readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ignores a corrupt file instead of blocking the recorder", async () => {
    await fs.writeFile(filePath, "{ not json");

    await expect(new RecorderSettingsStore(filePath).read()).resolves.toBeNull();
  });
});
