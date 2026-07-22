import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SubtitleSidecarExistsError,
  writeSubtitleSidecar,
  writeTemporarySubtitleSidecar
} from "../src/main/subtitle-export";
import type { ExportVideoRequest } from "../src/shared/types";

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "ovc-subtitle-export-test-"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

function subtitleRequest(): ExportVideoRequest {
  return {
    source: { kind: "import", importId: "video" },
    format: "mp4",
    resolution: "source",
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    audioLevels: {},
    backgroundAudioImportIds: [],
    subtitles: [{ start: 0.25, end: 1.5, text: "Hello" }],
    subtitleMode: "sidecar"
  };
}

describe("subtitle export file safety", () => {
  it("refuses to overwrite an existing sidecar and preserves its contents", async () => {
    const outputPath = path.join(directory, "movie.mp4");
    const subtitlePath = path.join(directory, "movie.srt");
    await fs.writeFile(subtitlePath, "existing subtitles", "utf8");

    await expect(writeSubtitleSidecar(outputPath, subtitleRequest())).rejects.toEqual(
      expect.objectContaining({
        name: "SubtitleSidecarExistsError",
        subtitlePath,
        message: expect.stringMatching(/already exists.*different export name/is)
      })
    );
    await expect(fs.readFile(subtitlePath, "utf8")).resolves.toBe("existing subtitles");
  });

  it("uses exclusive creation when two sidecar writes race", async () => {
    const outputPath = path.join(directory, "race.mp4");
    const results = await Promise.allSettled([
      writeSubtitleSidecar(outputPath, subtitleRequest()),
      writeSubtitleSidecar(outputPath, subtitleRequest())
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(SubtitleSidecarExistsError)
    });
  });

  it("isolates burn-in subtitles and removes only their temporary directory", async () => {
    const existingSidecar = path.join(directory, "movie.srt");
    await fs.writeFile(existingSidecar, "keep me", "utf8");

    const first = await writeTemporarySubtitleSidecar(subtitleRequest());
    const second = await writeTemporarySubtitleSidecar(subtitleRequest());
    expect(first.path).not.toBeNull();
    expect(second.path).not.toBeNull();
    expect(path.dirname(first.path as string)).not.toBe(path.dirname(second.path as string));

    await first.cleanup();
    await expect(fs.access(first.path as string)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(second.path as string)).resolves.toBeUndefined();
    await expect(fs.readFile(existingSidecar, "utf8")).resolves.toBe("keep me");

    await second.cleanup();
  });
});
