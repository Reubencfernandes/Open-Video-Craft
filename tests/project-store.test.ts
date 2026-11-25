import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultEdits } from "../src/shared/defaults";
import { createDefaultEditorState } from "../src/shared/editor-domain";
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
  it("refuses permanent discard of projects loaded from disk", async () => {
    const creator = new ProjectStore({ appVersion: "test" });
    const project = await creator.createProject({ name: "Saved", baseDirectory: tmpDir });
    const store = new ProjectStore({ appVersion: "test" });
    await store.loadProject(project.rootPath);
    await expect(store.discardProject(project.id)).rejects.toThrow(/unfinished recording/);
    expect(store.hasProject(project.id)).toBe(true);
    await expect(fs.stat(project.rootPath)).resolves.toBeTruthy();
    await expect(creator.discardProject(project.id)).resolves.toBe(true);
  });

  it("reserves separate folders for simultaneous identical project names", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0", clock: () => new Date("2026-01-01T00:00:00Z") });
    const projects = await Promise.all(Array.from({ length: 4 }, () =>
      store.createProject({ name: "Same name", baseDirectory: tmpDir })
    ));
    expect(new Set(projects.map((project) => project.rootPath)).size).toBe(4);
    for (const project of projects) {
      const saved = JSON.parse(await fs.readFile(path.join(project.rootPath, "project.json"), "utf8"));
      expect(saved.id).toBe(project.id);
    }
  });

  it("preserves existing edit and subtitle files when renaming a project", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Original", baseDirectory: tmpDir });
    const edits = '{"custom":"saved edits"}';
    const subtitles = '{"segments":[{"text":"Keep me"}]}';
    await fs.writeFile(path.join(project.rootPath, "edits.json"), edits);
    await fs.writeFile(path.join(project.rootPath, "subtitles.json"), subtitles);
    await store.renameProject(project.id, "Renamed");
    expect(await fs.readFile(path.join(project.rootPath, "edits.json"), "utf8")).toBe(edits);
    expect(await fs.readFile(path.join(project.rootPath, "subtitles.json"), "utf8")).toBe(subtitles);
    expect(store.getProject(project.id).name).toBe("Renamed");
  });

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
        state: {
          ...createDefaultEditorState(),
          timelineSegments: [
            { id: "clip", itemId: "music", track: "audio", lane: 0, start: 0, end: 12, sourceStart: 0 }
          ]
        },
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

    expect(saved?.state.timelineSegments).toEqual([
      { id: "clip", itemId: "music", track: "audio", lane: 0, start: 0, end: 12, sourceStart: 0 }
    ]);
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

describe("ProjectStore multi-source recording", () => {
  const multiSourceRequest = (projectId: string) => ({
    projectId,
    source: {
      id: "screen:0:0",
      name: "Display 1",
      kind: "screen" as const,
      displayId: "1"
    },
    sources: [
      { id: "screen:0:0", name: "Display 1", kind: "screen" as const, displayId: "1" },
      { id: "screen:1:0", name: "Display 2", kind: "screen" as const, displayId: "2" }
    ],
    devices: {
      microphone: { enabled: true, deviceId: "mic-1", label: "Microphone" },
      camera: { enabled: true, deviceId: "camera-1", label: "Face" }
    },
    tracks: {
      screen: { enabled: true as const, mimeType: "video/webm" },
      camera: { enabled: true, mimeType: "video/webm" },
      mic: { enabled: true, mimeType: "audio/webm" },
      system: { enabled: true, mimeType: "audio/webm" }
    },
    captures: [
      { trackId: "screen", kind: "screen" as const, sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" },
      { trackId: "screen-2", kind: "screen" as const, sourceId: "screen:1:0", label: "Display 2", mimeType: "video/webm" },
      { trackId: "camera", kind: "camera" as const, sourceId: "camera-1", label: "Face", mimeType: "video/webm" },
      { trackId: "camera-2", kind: "camera" as const, sourceId: "camera-2", label: "Desk", mimeType: "video/webm" },
      { trackId: "micWebm", kind: "mic" as const, sourceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
      { trackId: "systemWebm", kind: "system" as const, sourceId: null, label: "System audio", mimeType: "audio/webm" }
    ]
  });

  it("creates one media file per selected screen, camera, microphone, and system source", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Multi", baseDirectory: tmpDir });
    const started = await store.startRecording(multiSourceRequest(project.id));

    expect(started.tracks.screen?.path).toBe("media/screen.webm");
    expect(started.tracks["screen-2"]?.path).toBe("media/screen-2.webm");
    expect(started.tracks["camera-2"]?.path).toBe("media/camera-2.webm");
    expect(started.tracks.micWebm?.path).toBe("media/mic.webm");
    expect(started.tracks.systemWebm?.path).toBe("media/system.webm");
    expect(started.recordingTracks?.map((track) => track.trackId)).toEqual([
      "screen",
      "screen-2",
      "camera",
      "camera-2",
      "micWebm",
      "systemWebm"
    ]);
    expect(started.sources?.map((source) => source.id)).toEqual(["screen:0:0", "screen:1:0"]);
    for (const relativePath of [
      "media/screen.webm",
      "media/screen-2.webm",
      "media/camera.webm",
      "media/camera-2.webm",
      "media/mic.webm",
      "media/system.webm"
    ]) {
      await expect(fs.stat(path.join(project.rootPath, relativePath))).resolves.toBeTruthy();
    }
  });

  it("writes chunks to the selected track and keeps accepting the legacy recording kinds", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Multi chunks", baseDirectory: tmpDir });
    await store.startRecording(multiSourceRequest(project.id));

    await store.appendChunk(project.id, "screen-2", Buffer.from("second-screen"));
    await store.appendChunk(project.id, "camera-2", Buffer.from("second-camera"));
    await store.appendChunk(project.id, "mic", Buffer.from("mic"));
    const updated = await store.appendChunk(project.id, "systemWebm", Buffer.from("pc-audio"));

    expect(updated.tracks["screen-2"]?.bytesWritten).toBe("second-screen".length);
    expect(updated.tracks["camera-2"]?.bytesWritten).toBe("second-camera".length);
    expect(updated.tracks.micWebm?.bytesWritten).toBe(3);
    expect(updated.tracks.systemWebm?.bytesWritten).toBe("pc-audio".length);
    expect(
      await fs.readFile(path.join(project.rootPath, "media", "screen-2.webm"), "utf8")
    ).toBe("second-screen");
    expect(
      await fs.readFile(path.join(project.rootPath, "media", "system.webm"), "utf8")
    ).toBe("pc-audio");
  });

  it("reports every recorded track so post-processing covers each one", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Multi post", baseDirectory: tmpDir });
    await store.startRecording(multiSourceRequest(project.id));

    expect(store.getRecordedTracks(project.id).map((track) => `${track.kind}:${track.trackId}`))
      .toEqual([
        "screen:screen",
        "screen:screen-2",
        "camera:camera",
        "camera:camera-2",
        "mic:micWebm",
        "system:systemWebm"
      ]);
    expect(store.getWavOutputPath(project.id, "micWebm")).toBe(
      path.join(project.rootPath, "media", "mic.wav")
    );
    expect(store.getWavOutputPath(project.id, "mic-2")).toBe(
      path.join(project.rootPath, "media", "mic-2.wav")
    );
    expect(store.getWavOutputPath(project.id, "screen-2")).toBeNull();
  });

  it("keeps microphone and system audio on separate WAV outputs", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Audio tracks", baseDirectory: tmpDir });
    await store.startRecording(multiSourceRequest(project.id));

    await store.appendChunk(project.id, "micWebm", Buffer.from("mic"));
    const stopped = await store.stopRecording({ projectId: project.id, durationMs: 5000 });
    expect(stopped.status).toBe("processing");

    const completed = await store.completeAudio(project.id, [
      { trackId: "micWebm", bytes: 11 },
      { trackId: "systemWebm", bytes: 22 }
    ], 5200);

    expect(completed.status).toBe("complete");
    expect(completed.durationMs).toBe(5200);
    expect(completed.tracks.micWav?.path).toBe("media/mic.wav");
    expect(completed.tracks.micWav?.bytesWritten).toBe(11);
    expect(completed.tracks.systemWav?.path).toBe("media/system.wav");
    expect(completed.tracks.systemWav?.bytesWritten).toBe(22);
  });

  it("does not add a recording plan to legacy single-source requests", async () => {
    const store = new ProjectStore({ appVersion: "1.0.0" });
    const project = await store.createProject({ name: "Legacy", baseDirectory: tmpDir });
    const started = await store.startRecording({
      projectId: project.id,
      source: { id: "screen:0:0", name: "Display", kind: "screen", displayId: "1" },
      devices: {
        microphone: { enabled: false, deviceId: null, label: null },
        camera: { enabled: false, deviceId: null, label: null }
      },
      tracks: {
        screen: { enabled: true, mimeType: "video/webm" },
        camera: { enabled: false, mimeType: null },
        mic: { enabled: false, mimeType: null }
      }
    });

    expect(started.recordingTracks).toBeUndefined();
    expect(started.tracks.screen?.path).toBe("media/screen.webm");
    expect(store.getRecordedTracks(project.id)).toEqual([{ trackId: "screen", kind: "screen" }]);
  });
});
