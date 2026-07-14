import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertProjectDeletionTarget } from "../src/main/project-deletion";
import { ProjectStore } from "../src/main/project-store";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-delete-target-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("project deletion safety", () => {
  it("accepts only a project folder with the expected id", async () => {
    const project = await new ProjectStore({ appVersion: "2.0.0" }).createProject({
      name: "Safe delete",
      baseDirectory: tmpDir
    });
    await expect(assertProjectDeletionTarget(project.rootPath, project.id)).resolves.toBeUndefined();
    await expect(assertProjectDeletionTarget(project.rootPath, "different-id")).rejects.toThrow(
      /does not match/u
    );
  });

  it("rejects an arbitrary folder", async () => {
    const arbitrary = path.join(tmpDir, "not-a-project");
    await fs.mkdir(arbitrary);
    await expect(assertProjectDeletionTarget(arbitrary, "id")).rejects.toThrow(/not a valid/u);
  });
});
