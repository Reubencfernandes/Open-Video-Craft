import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectStore } from "../src/main/project-store";
import { createReelProject, retimeSubtitlesForRanges } from "../src/main/reel-project";
import { readEditorDocument } from "../src/main/editor-document-store";
import { mediaTrackRelativePaths } from "../src/main/project-paths";
import { saveEditorDocument } from "../src/main/editor-document-store";
import { createDefaultEditorState } from "../src/shared/editor-domain";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-reel-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const cue = (id: string, start: number, end: number, text: string) => ({ id, start, end, text });

describe("reel subtitle retiming", () => {
  it("moves kept cues onto the reel timeline and drops the rest", () => {
    const retimed = retimeSubtitlesForRanges(
      [cue("a", 1, 3, "kept"), cue("b", 5, 7, "dropped"), cue("c", 11, 13, "kept later")],
      [{ start: 0, end: 4 }, { start: 10, end: 14 }]
    );

    expect(retimed.map((entry) => [entry.start, entry.end])).toEqual([
      [1, 3],
      [5, 7]
    ]);
    expect(retimed[1]?.id).toBe("c-reel-2");
  });

  it("clips a cue that straddles the edge of a kept range", () => {
    const retimed = retimeSubtitlesForRanges([cue("a", 3, 9, "spans the cut")], [{ start: 0, end: 5 }]);
    expect(retimed).toHaveLength(1);
    expect(retimed[0]?.end).toBe(5);
  });
});

describe("derived reel project", () => {
  it("creates a separate project with the highlights in order and the media copied", async () => {
    const store = new ProjectStore({ appVersion: "test" });
    const source = await store.createProject({ name: "Source", baseDirectory: tmpDir });
    const screenPath = path.join(source.rootPath, mediaTrackRelativePaths.screen);
    await fs.mkdir(path.dirname(screenPath), { recursive: true });
    await fs.writeFile(screenPath, Buffer.from("fake-webm"));
    await saveEditorDocument({
      rootPath: source.rootPath,
      baseRevision: 0,
      state: {
        ...createDefaultEditorState(),
        subtitles: [cue("s1", 1, 3, "first moment"), cue("s2", 21, 24, "second moment")],
        timelineSegments: [
          { id: "seg", itemId: `${source.id}:screen`, track: "video", lane: 0, start: 0, end: 30, sourceStart: 0 }
        ]
      },
      imports: [],
      source: "editor",
      checkpoint: false
    });

    const reel = await createReelProject({
      store,
      sourceProject: store.getProject(source.id),
      ranges: [{ start: 0, end: 5 }, { start: 20, end: 25 }],
      subtitles: [cue("s1", 1, 3, "first moment"), cue("s2", 21, 24, "second moment")]
    });

    expect(reel.id).not.toBe(source.id);
    expect(reel.rootPath).not.toBe(source.rootPath);
    expect(reel.name).toContain("Reel");

    const document = await readEditorDocument(reel.rootPath);
    expect(document).not.toBeNull();
    const videoSegments = document?.state.timelineSegments.filter((segment) => segment.track === "video") ?? [];
    expect(videoSegments.map((segment) => [segment.start, segment.end, segment.sourceStart])).toEqual([
      [0, 5, 0],
      [5, 10, 20]
    ]);
    expect(document?.state.subtitleStyle).toBe("karaoke");
    expect(document?.state.subtitles.map((entry) => [entry.start, entry.end])).toEqual([
      [1, 3],
      [6, 9]
    ]);
    expect(document?.imports).toHaveLength(1);

    const copied = path.join(reel.rootPath, document?.imports[0]?.relativePath ?? "missing");
    await expect(fs.readFile(copied, "utf8")).resolves.toBe("fake-webm");
  });

  it("refuses to build a reel from a project without a screen recording", async () => {
    const store = new ProjectStore({ appVersion: "test" });
    const source = await store.createProject({ name: "Empty", baseDirectory: tmpDir });

    await expect(
      createReelProject({ store, sourceProject: source, ranges: [{ start: 0, end: 5 }] })
    ).rejects.toThrow(/no recorded screen/);
  });

  it("requires at least one highlight", async () => {
    const store = new ProjectStore({ appVersion: "test" });
    const source = await store.createProject({ name: "Empty", baseDirectory: tmpDir });
    await expect(
      createReelProject({ store, sourceProject: source, ranges: [] })
    ).rejects.toThrow(/at least one highlight/);
  });
});
