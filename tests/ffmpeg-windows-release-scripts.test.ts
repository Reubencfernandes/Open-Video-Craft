import { describe, expect, it } from "vitest";

// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import { getPeArchitecture, WINDOWS_FFMPEG } from "../scripts/prepare-windows-ffmpeg.mjs";
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
    header.write("PE\0\0", 128, "ascii");
    header.writeUInt16LE(0x8664, 132);
    expect(getPeArchitecture(header)).toBe("x64");
    header.writeUInt16LE(0xaa64, 132);
    expect(getPeArchitecture(header)).toBe("arm64");
  });

  it("requires Setup, Portable, and updater metadata", () => {
    const setup = "Open-Video-Craft-Setup-1.0.2-win-x64.exe";
    const portable = "Open-Video-Craft-Portable-1.0.2-win-x64.exe";
    expect(validateWindowsUpdateMetadataShape(
      [setup, portable],
      `version: 1.0.2\npath: ${setup}\nfiles:\n  - url: ${setup}`
    )).toEqual({ setupName: setup, portableName: portable });
  });
});
