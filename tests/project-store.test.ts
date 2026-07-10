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

    const loadedProject = await new ProjectStore({
      appVersion: "1.0.0"
    }).loadProject(project.rootPath);
    expect(loadedProject.id).toBe(project.id);
    expect(loadedProject.rootPath).toBe(project.rootPath);
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

  it("serializes concurrent media writes and keeps project metadata valid", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Concurrent recording", baseDirectory: tmpDir });

    await store.startRecording({
      projectId: project.id,
      source: { id: "screen:1", name: "Entire screen", kind: "screen", displayId: "1" },
      devices: {
        microphone: { enabled: true, deviceId: "mic-1", label: "Microphone" },
        camera: { enabled: true, deviceId: "camera-1", label: "Camera" }
      },
      tracks: {
        screen: { enabled: true, mimeType: "video/webm" },
        camera: { enabled: true, mimeType: "video/webm" },
        mic: { enabled: true, mimeType: "audio/webm" }
      }
    });

    const tracks = ["screen", "camera", "mic"] as const;
    await Promise.all(
      Array.from({ length: 20 }, (_value, index) =>
        store.appendChunk(project.id, tracks[index % tracks.length], Buffer.from("x"))
      )
    );

    const metadata = JSON.parse(
      await fs.readFile(path.join(project.rootPath, "project.json"), "utf8")
    );
    const totalBytes =
      metadata.tracks.screen.bytesWritten +
      metadata.tracks.camera.bytesWritten +
      metadata.tracks.micWebm.bytesWritten;
    expect(totalBytes).toBe(20);
  });

  it("stores editor state and imported assets inside the project folder", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Portable edit", baseDirectory: tmpDir });
    const sourcePath = path.join(tmpDir, "outside-project.mp3");
    await fs.writeFile(sourcePath, "audio");

    await store.saveEditorState(
      project.id,
      {
        state: { v: 2, timelineSegments: [{ id: "clip", itemId: "music", start: 0 }] },
        imports: [
          {
            id: "music",
            name: "outside-project.mp3",
            kind: "audio",
            extension: "mp3",
            duration: 12
          }
        ]
      },
      (id) => (id === "music" ? sourcePath : null)
    );

    const reloadedStore = new ProjectStore({ appVersion: "1.0.0" });
    await reloadedStore.loadProject(project.rootPath);
    const saved = await reloadedStore.readEditorState(project.id);

    expect(saved?.state).toEqual({
      v: 2,
      timelineSegments: [{ id: "clip", itemId: "music", start: 0 }]
    });
    expect(saved?.imports).toMatchObject([
      {
        id: "music",
        relativePath: "imports/music.mp3"
      }
    ]);
    await expect(
      fs.readFile(path.join(project.rootPath, "imports", "music.mp3"), "utf8")
    ).resolves.toBe("audio");
  });
});
