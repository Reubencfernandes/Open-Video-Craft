import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultEdits } from "../src/shared/defaults";
import { ProjectStore, createProjectFolderName, getMediaTrackRelativePath } from "../src/main/project-store";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-project-store-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("project folder naming", () => {
  it("creates filesystem-safe timestamped project folder names", () => {
    expect(
      createProjectFolderName(
        "My Demo: React + Electron!",
        new Date("2026-07-01T12:13:14.150Z")
      )
    ).toBe("my-demo-react-electron-2026-07-01T12-13-14-150Z");
  });
});

describe("ProjectStore", () => {
  it("creates a transparent project folder with default JSON files", async () => {
    const store = new ProjectStore({
      appVersion: "1.0.0",
      clock: () => new Date("2026-07-01T12:00:00.000Z")
    });

    const project = await store.createProject({
      name: "Course Demo",
      baseDirectory: tmpDir
    });

    const projectJson = JSON.parse(
      await fs.readFile(path.join(project.rootPath, "project.json"), "utf8")
    );
    const editsJson = JSON.parse(
      await fs.readFile(path.join(project.rootPath, "edits.json"), "utf8")
    );
    const subtitlesJson = JSON.parse(
      await fs.readFile(path.join(project.rootPath, "subtitles.json"), "utf8")
    );

    expect(projectJson).toMatchObject({
      schemaVersion: 1,
      appVersion: "1.0.0",
      name: "Course Demo",
      status: "created",
      tracks: {}
    });
    expect(editsJson).toEqual(createDefaultEdits());
    expect(subtitlesJson).toMatchObject({
      schemaVersion: 1,
      segments: []
    });
    await expect(fs.stat(path.join(project.rootPath, "media"))).resolves.toBeTruthy();
  });

  it("tracks recording metadata and bytes written per media track", async () => {
    const store = new ProjectStore({
      appVersion: "1.0.0",
      clock: () => new Date("2026-07-01T12:00:00.000Z")
    });

    const project = await store.createProject({
      name: "Recording",
      baseDirectory: tmpDir
    });

    const started = await store.startRecording({
      projectId: project.id,
      source: {
        id: "screen:1",
        name: "Entire screen",
        kind: "screen",
        displayId: "1"
      },
      devices: {
        microphone: {
          enabled: true,
          deviceId: "mic-1",
          label: "Microphone"
        },
        camera: {
          enabled: false,
          deviceId: null,
          label: null
        }
      },
      tracks: {
        screen: {
          enabled: true,
          mimeType: "video/webm"
        },
        camera: {
          enabled: false,
          mimeType: null
        },
        mic: {
          enabled: true,
          mimeType: "audio/webm"
        }
      }
    });

    expect(started.tracks.screen?.path).toBe(getMediaTrackRelativePath("screen"));
    expect(started.tracks.micWebm?.path).toBe(getMediaTrackRelativePath("micWebm"));

    await store.appendChunk(project.id, "screen", Buffer.from("screen"));
    const updated = await store.appendChunk(project.id, "mic", Buffer.from("mic"));
    expect(updated.tracks.screen?.bytesWritten).toBe(6);
    expect(updated.tracks.micWebm?.bytesWritten).toBe(3);

    const stopped = await store.stopRecording({
      projectId: project.id,
      durationMs: 1234.56
    });
    expect(stopped.status).toBe("processing");
    expect(stopped.durationMs).toBe(1235);
  });
});
