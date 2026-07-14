import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectLibrary } from "../src/main/project-library";
import { ProjectStore } from "../src/main/project-store";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-project-library-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ProjectLibrary", () => {
  it("stores, refreshes, marks missing, and removes recent projects", async () => {
    const store = new ProjectStore({
      appVersion: "1.0.0",
      clock: () => new Date("2026-07-01T12:00:00.000Z")
    });
    const project = await store.createProject({
      name: "Library Demo",
      baseDirectory: tmpDir
    });
    const library = new ProjectLibrary(path.join(tmpDir, "user-data", "projects.json"));

    await library.upsert(project);
    const listed = await library.listRecent();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: project.id,
      name: "Library Demo",
      rootPath: project.rootPath,
      status: "created",
      available: true,
      mediaAvailability: {
        screen: false,
        camera: false,
        audio: false
      }
    });

    await fs.rm(project.rootPath, { recursive: true, force: true });
    const missing = await library.listRecent();
    expect(missing[0]).toMatchObject({
      id: project.id,
      available: false
    });

    await expect(library.remove(project.id)).resolves.toBe(true);
    await expect(library.listRecent()).resolves.toEqual([]);
  });

  it("caps the recent list and refreshes get without scanning unrelated projects", async () => {
    const store = new ProjectStore({ appVersion: "2.0.0" });
    const library = new ProjectLibrary(path.join(tmpDir, "user-data", "projects.json"), 2);
    const first = await store.createProject({ name: "First", baseDirectory: tmpDir });
    const second = await store.createProject({ name: "Second", baseDirectory: tmpDir });
    const third = await store.createProject({ name: "Third", baseDirectory: tmpDir });

    await library.upsert(first);
    await library.upsert(second);
    await library.upsert(third);

    await expect(library.listRecent()).resolves.toHaveLength(2);
    await fs.writeFile(path.join(second.rootPath, "project.json"), "not json");
    await expect(library.get(third.id)).resolves.toMatchObject({ id: third.id, available: true });
  });
});
