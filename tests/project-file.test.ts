import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readProjectFile } from "../src/main/project-file";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-project-file-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const createdAt = "2026-01-01T00:00:00.000Z";

function track(relativePath: string, mimeType = "video/webm") {
  return { path: relativePath, mimeType, bytesWritten: 16, createdAt, updatedAt: createdAt };
}

function projectFile(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    appVersion: "1.0.0",
    id: "project-1",
    name: "Recording",
    createdAt,
    updatedAt: createdAt,
    status: "complete",
    source: null,
    devices: {
      microphone: { enabled: false, deviceId: null, label: null },
      camera: { enabled: false, deviceId: null, label: null }
    },
    tracks: {},
    durationMs: null,
    startedAt: null,
    stoppedAt: null,
    error: null,
    ...overrides
  };
}

async function writeProject(value: unknown): Promise<string> {
  await fs.writeFile(path.join(tmpDir, "project.json"), JSON.stringify(value));
  return tmpDir;
}

describe("readProjectFile", () => {
  it("reads a legacy single-source project file", async () => {
    const rootPath = await writeProject(projectFile({
      tracks: {
        screen: track("media/screen.webm"),
        micWebm: track("media/mic.webm", "audio/webm"),
        micWav: track("media/mic.wav", "audio/wav")
      }
    }));

    const project = await readProjectFile(rootPath);

    expect(project.tracks.screen?.path).toBe("media/screen.webm");
    expect(project.tracks.micWav?.mimeType).toBe("audio/wav");
    expect(project.recordingTracks).toBeUndefined();
  });

  it("reads every screen, camera, and audio track of a multi-source project", async () => {
    const rootPath = await writeProject(projectFile({
      tracks: {
        screen: track("media/screen.webm"),
        "screen-2": track("media/screen-2.webm"),
        camera: track("media/camera.webm"),
        "camera-2": track("media/camera-2.webm"),
        micWebm: track("media/mic.webm", "audio/webm"),
        "mic-2": track("media/mic-2.webm", "audio/webm"),
        "mic-2-wav": track("media/mic-2.wav", "audio/wav"),
        systemWebm: track("media/system.webm", "audio/webm")
      },
      recordingTracks: [
        { trackId: "screen", kind: "screen", sourceId: "screen:0:0", label: "Display 1" },
        { trackId: "screen-2", kind: "screen", sourceId: "screen:1:0", label: "Display 2" },
        { trackId: "camera", kind: "camera", sourceId: "camera-1", label: "Face" },
        { trackId: "camera-2", kind: "camera", sourceId: "camera-2", label: "Desk" },
        { trackId: "micWebm", kind: "mic", sourceId: "mic-1", label: "Microphone" },
        { trackId: "mic-2", kind: "mic", sourceId: "mic-2", label: "Headset" },
        { trackId: "systemWebm", kind: "system", sourceId: null, label: "System audio" }
      ]
    }));

    const project = await readProjectFile(rootPath);

    expect(Object.keys(project.tracks).sort()).toEqual([
      "camera",
      "camera-2",
      "mic-2",
      "mic-2-wav",
      "micWebm",
      "screen",
      "screen-2",
      "systemWebm"
    ]);
    expect(project.tracks["screen-2"]?.path).toBe("media/screen-2.webm");
    expect(project.tracks["mic-2-wav"]?.path).toBe("media/mic-2.wav");
    expect(project.recordingTracks?.map((recordingTrack) => recordingTrack.trackId))
      .toEqual(["screen", "screen-2", "camera", "camera-2", "micWebm", "mic-2", "systemWebm"]);
    expect(project.recordingTracks?.[3]?.label).toBe("Desk");
  });

  it("rejects a track whose stored path does not belong to its track id", async () => {
    const rootPath = await writeProject(projectFile({
      tracks: {
        screen: track("media/screen-2.webm")
      }
    }));

    await expect(readProjectFile(rootPath)).rejects.toThrow(/not a valid Open Video Craft project/);
  });

  it("rejects recording tracks that disagree with the persisted media tracks", async () => {
    const rootPath = await writeProject(projectFile({
      tracks: {
        screen: track("media/screen.webm")
      },
      recordingTracks: [
        { trackId: "screen", kind: "camera", sourceId: null, label: "Wrong kind" }
      ]
    }));

    await expect(readProjectFile(rootPath)).rejects.toThrow(/not a valid Open Video Craft project/);
  });

  it("rejects recorded tracks without persisted media", async () => {
    const rootPath = await writeProject(projectFile({
      tracks: {
        screen: track("media/screen.webm")
      },
      recordingTracks: [
        { trackId: "screen-2", kind: "screen", sourceId: null, label: "Missing media" }
      ]
    }));

    await expect(readProjectFile(rootPath)).rejects.toThrow(/not a valid Open Video Craft project/);
  });
});
