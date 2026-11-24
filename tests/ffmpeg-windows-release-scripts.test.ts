import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import {
  getPeArchitecture,
  obtainPinnedWindowsFfmpeg,
  WINDOWS_FFMPEG
} from "../scripts/prepare-windows-ffmpeg.mjs";
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import { validateWindowsUpdateMetadataShape } from "../scripts/verify-windows-release.mjs";

describe("Windows release inputs", () => {
  it("pins the BtbN archive and extracted executable", () => {
    expect(WINDOWS_FFMPEG).toMatchObject({
      archiveSha256: "ebf57e8b1a10b176b88c3cbc66e68a4aed472cf47520b0fbf003e892fb3be642",
      binarySha256: "070be6f5202e71a5e0bec88312230eebf2708f9b9ee3694596babf20902dddd2",
      version: "8.1.2"
    });
  });

  it("recognizes Windows x64 PE headers", () => {
    const header = Buffer.alloc(512);
    header.write("MZ", 0, "ascii");
    header.writeUInt32LE(128, 0x3c);
    header.writeUInt32LE(0x00004550, 128);
    header.writeUInt16LE(0x8664, 132);
    expect(getPeArchitecture(header)).toBe("x64");
    header.writeUInt16LE(0xaa64, 132);
    expect(getPeArchitecture(header)).toBe("arm64");
  });

  it("requires Setup, Portable, and updater metadata", () => {
    const setup = `Open-Video-Craft-Setup-${packageJson.version}-win-x64.exe`;
    const portable = `Open-Video-Craft-Portable-${packageJson.version}-win-x64.exe`;
    expect(validateWindowsUpdateMetadataShape(
      [setup, portable],
      `version: ${packageJson.version}\npath: ${setup}\nfiles:\n  - url: ${setup}`
    )).toEqual({ setupName: setup, portableName: portable });
  });
});

describe("Windows FFmpeg download fallback", () => {
  function createIo(input: { upstreamFails: boolean }) {
    const downloads: string[] = [];
    return {
      downloads,
      io: {
        downloadFile: async (url: string) => {
          downloads.push(url);
          if (input.upstreamFails && url === WINDOWS_FFMPEG.archiveUrl) {
            throw new Error(`Download failed with HTTP 404 Not Found: ${url}`);
          }
        },
        sha256File: async () => WINDOWS_FFMPEG.archiveSha256,
        extractArchive: async () => undefined,
        findWindowsFfmpeg: async (directory: string) => `${directory}/bin/ffmpeg.exe`,
        log: () => undefined
      }
    };
  }

  it("mirrors the exact pinned executable on this repository's releases", () => {
    expect(WINDOWS_FFMPEG.mirrorBinaryUrl).toMatch(
      /^https:\/\/github\.com\/Reubencfernandes\/Open-Video-Craft\/releases\/download\/v1\.0\.5\/ffmpeg-n8\.1\.2-29-g703dcc25b9-win64-gpl\.exe$/
    );
  });

  it("uses the upstream archive while it exists", async () => {
    const { io, downloads } = createIo({ upstreamFails: false });
    const binary = await obtainPinnedWindowsFfmpeg(tmpdir(), io);
    expect(downloads).toEqual([WINDOWS_FFMPEG.archiveUrl]);
    expect(binary).toMatch(/extracted\/bin\/ffmpeg\.exe$/);
  });

  it("falls back to the mirror when upstream pruned the archive", async () => {
    const { io, downloads } = createIo({ upstreamFails: true });
    const binary = await obtainPinnedWindowsFfmpeg(tmpdir(), io);
    expect(downloads).toEqual([WINDOWS_FFMPEG.archiveUrl, WINDOWS_FFMPEG.mirrorBinaryUrl]);
    expect(binary).toMatch(/ffmpeg-mirror\.exe$/);
  });
});
