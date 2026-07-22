import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// These release scripts are intentionally plain JavaScript so electron-builder and
// npm lifecycle hooks can execute them without compiling the application first.
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import { MAC_FFMPEG_ARCHIVES } from "../scripts/prepare-ffmpeg.mjs";
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import {
  shouldRunMacRuntimeValidation,
  validateFfmpegOutputs,
  validateFfmpegStaticStrings,
} from "../scripts/verify-ffmpeg.mjs";
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import {
  getArchiveArchitectures,
  getCheckedCommandOutput,
  getEmbeddedFfmpegTargets,
  validateMacUpdateMetadataShape,
} from "../scripts/verify-mac-release.mjs";
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import { getPeArchitecture, WINDOWS_FFMPEG } from "../scripts/prepare-windows-ffmpeg.mjs";
// @ts-expect-error The JavaScript release script intentionally has no declaration file.
import { validateWindowsUpdateMetadataShape } from "../scripts/verify-windows-release.mjs";

const require = createRequire(import.meta.url);
type AfterPackModule = {
  (context: { electronPlatformName: string }): Promise<void>;
  getArchitectureName(architecture: number | string): string;
  getCopyOperations(context: { arch: number | string }): Array<{
    architecture: string;
    unpackedDirectory: string;
  }>;
  getUniversalBinaryCandidates(resourcesDirectory: string): {
    merged: UniversalValidationTarget;
    split: UniversalValidationTarget[];
  };
  resolveUniversalValidationTargets(
    resourcesDirectory: string,
    exists?: (binaryPath: string) => Promise<boolean>,
  ): Promise<UniversalValidationTarget[]>;
};

const afterPackModulePath = ["..", "scripts", "after-pack.cjs"].join("/");
const afterPack = process.platform === "darwin"
  ? require(afterPackModulePath) as AfterPackModule
  : null;

type UniversalValidationTarget = {
  binaryPath: string;
  architectures: string[];
  layout: string;
};

const validOutputs = {
  versionOutput: "configuration: --enable-gpl --enable-libx264 --enable-libvpx",
  encoderOutput: " V....D libx264 H.264\n V....D libvpx-vp9 VP9",
  filterOutput: " T.C drawtext V->V Draw text\n ... subtitles V->V Render subtitles"
};

const validStaticStrings = [
  "configuration: --enable-gpl --enable-libx264 --enable-libvpx",
  "libx264",
  "libvpx-vp9",
  "drawtext",
  "subtitles"
].join("\n");

describe("FFmpeg release validation", () => {
  it("accepts the required free encoders and filters", () => {
    expect(() => validateFfmpegOutputs(validOutputs)).not.toThrow();
  });

  it("rejects nonfree builds even when all capabilities exist", () => {
    expect(() => validateFfmpegOutputs({
      ...validOutputs,
      versionOutput: `${validOutputs.versionOutput} --enable-nonfree`
    })).toThrow(/--enable-nonfree/);
  });

  it("reports missing release capabilities", () => {
    expect(() => validateFfmpegOutputs({
      versionOutput: "configuration: --enable-libx264",
      encoderOutput: " V....D libx264 H.264",
      filterOutput: " ... drawtext V->V Draw text"
    })).toThrow(/--enable-libvpx[\s\S]*libvpx-vp9[\s\S]*subtitles/);
  });

  it("requires exact configuration-flag tokens", () => {
    expect(() => validateFfmpegOutputs({
      ...validOutputs,
      versionOutput: "configuration: --enable-libx264rgb --enable-libvpx-vp9"
    })).toThrow(/--enable-libx264[\s\S]*--enable-libvpx/);

    expect(() => validateFfmpegStaticStrings(
      validStaticStrings.replace(
        "--enable-libx264 --enable-libvpx",
        "--enable-libx264rgb --enable-libvpx-vp9",
      ),
    )).toThrow(/--enable-libx264[\s\S]*--enable-libvpx/);
  });

  it("validates non-native Mach-O capability markers without execution", () => {
    expect(() => validateFfmpegStaticStrings(validStaticStrings)).not.toThrow();
    expect(() => validateFfmpegStaticStrings(
      `${validStaticStrings} --enable-nonfree`,
    )).toThrow(/--enable-nonfree/);
    expect(() => validateFfmpegStaticStrings(
      validStaticStrings.replace("\nsubtitles", ""),
    )).toThrow(/capability marker subtitles/);
  });

  it("runs full runtime validation only when the binary contains the native slice", () => {
    expect(shouldRunMacRuntimeValidation(["arm64"], "arm64")).toBe(true);
    expect(shouldRunMacRuntimeValidation(["x64"], "arm64")).toBe(false);
    expect(shouldRunMacRuntimeValidation(["x64", "arm64"], "arm64")).toBe(true);
    expect(shouldRunMacRuntimeValidation(["arm64"], "x64")).toBe(false);
  });
});

describe("pinned macOS FFmpeg inputs", () => {
  it("keeps the release archives and checksums pinned", () => {
    expect(MAC_FFMPEG_ARCHIVES).toEqual({
      arm64: {
        url: "https://ffmpeg.martin-riedl.de/download/macos/arm64/1783011502_8.1.2/ffmpeg.zip",
        sha256: "ef1aa60006c7b77ce170c1608c08d8e4ba1c30c5746f2ac986ded932d0ac2c3c"
      },
      x64: {
        url: "https://ffmpeg.martin-riedl.de/download/macos/amd64/1783018342_8.1.2/ffmpeg.zip",
        sha256: "a52ef43883f44c219766d4b3bdde4e635b35465d0b704c01c3a0566b59775df9"
      }
    });
  });
});

describe.runIf(afterPack !== null)("electron-builder FFmpeg routing", () => {
  const macAfterPack = afterPack as AfterPackModule;

  it("maps the installed numeric Arch values", () => {
    expect(macAfterPack.getArchitectureName(1)).toBe("x64");
    expect(macAfterPack.getArchitectureName(3)).toBe("arm64");
    expect(macAfterPack.getArchitectureName(4)).toBe("universal");
  });

  it("routes a thin build to app.asar.unpacked", () => {
    expect(macAfterPack.getCopyOperations({ arch: 3 })).toEqual([
      { architecture: "arm64", unpackedDirectory: "app.asar.unpacked" }
    ]);
  });

  it("does not overwrite the final universal binary with a thin slice", () => {
    expect(macAfterPack.getCopyOperations({ arch: 4 })).toEqual([]);
  });

  it("prefers the merged universal app.asar.unpacked layout", async () => {
    const resourcesDirectory = path.resolve("virtual", "Resources");
    const candidates = macAfterPack.getUniversalBinaryCandidates(resourcesDirectory);
    const targets = await macAfterPack.resolveUniversalValidationTargets(
      resourcesDirectory,
      async (binaryPath) => binaryPath === candidates.merged.binaryPath,
    );

    expect(targets).toEqual([candidates.merged]);
    expect(targets[0].architectures).toEqual(["x64", "arm64"]);
    expect(targets[0].binaryPath).toBe(path.join(
      resourcesDirectory,
      "app.asar.unpacked",
      "node_modules",
      "ffmpeg-static",
      "ffmpeg",
    ));
  });

  it("accepts the split universal layout only when both slices exist", async () => {
    const resourcesDirectory = path.resolve("virtual", "Resources");
    const candidates = macAfterPack.getUniversalBinaryCandidates(resourcesDirectory);
    const splitPaths = new Set(candidates.split.map(({ binaryPath }) => binaryPath));

    await expect(macAfterPack.resolveUniversalValidationTargets(
      resourcesDirectory,
      async (binaryPath) => splitPaths.has(binaryPath),
    )).resolves.toEqual(candidates.split);

    await expect(macAfterPack.resolveUniversalValidationTargets(
      resourcesDirectory,
      async (binaryPath) => binaryPath === candidates.split[0].binaryPath,
    )).rejects.toThrow(/Universal FFmpeg layout is incomplete/);

    await expect(macAfterPack.resolveUniversalValidationTargets(
      resourcesDirectory,
      async () => true,
    )).rejects.toThrow(/Universal FFmpeg layout is ambiguous/);
  });
});

describe("macOS release archive routing", () => {
  it("derives thin and universal FFmpeg architectures from artifact names", () => {
    expect(getArchiveArchitectures("Open-Video-Craft-1.0.2-mac-x64.zip")).toEqual(["x64"]);
    expect(getArchiveArchitectures("Open-Video-Craft-1.0.2-mac-arm64.zip")).toEqual(["arm64"]);
    expect(getArchiveArchitectures("Open-Video-Craft-1.0.2-mac-universal.zip")).toEqual(["x64", "arm64"]);
    expect(() => getArchiveArchitectures("Open-Video-Craft-1.0.2-mac.zip")).toThrow(
      /Cannot determine macOS architecture/,
    );
  });

  it("locates FFmpeg in merged and split packaged layouts", () => {
    const appPath = path.resolve("virtual", "Open Video Craft.app");
    const mergedTargets = getEmbeddedFfmpegTargets(
      appPath,
      ["x64", "arm64"],
      (binaryPath: string) => binaryPath.includes(`${path.sep}app.asar.unpacked${path.sep}`),
    );
    expect(mergedTargets).toEqual([{
      binaryPath: path.join(
        appPath,
        "Contents",
        "Resources",
        "app.asar.unpacked",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg",
      ),
      architectures: ["x64", "arm64"],
    }]);

    const splitTargets = getEmbeddedFfmpegTargets(
      appPath,
      ["x64", "arm64"],
      (binaryPath: string) => binaryPath.includes("app-x64.asar.unpacked")
        || binaryPath.includes("app-arm64.asar.unpacked"),
    );
    expect(splitTargets.map(({ architectures }: { architectures: string[] }) => architectures)).toEqual([
      ["x64"],
      ["arm64"],
    ]);
  });

  it("does not trust plausible output from a failed signing command", () => {
    const failedSpawn = (_command: string, _args: string[], _options: unknown) => ({
      status: 1,
      stdout: "accepted\nTeamIdentifier=3XX79RB95N\n",
      stderr: "verification failed\n",
    });
    expect(() => getCheckedCommandOutput("codesign", ["--verify", "app"], failedSpawn)).toThrow(
      /exited 1/,
    );

    const successfulSpawn = (_command: string, _args: string[], _options: unknown) => ({
      status: 0,
      stdout: "accepted\n",
      stderr: "",
    });
    expect(getCheckedCommandOutput("spctl", ["-a", "app"], successfulSpawn)).toContain("accepted");
  });

  it("requires complete architecture metadata with no stale ZIP entries", () => {
    const x64 = "Open-Video-Craft-1.0.2-mac-x64.zip";
    const arm64 = "Open-Video-Craft-1.0.2-mac-arm64.zip";
    const metadata = [
      "version: 1.0.2",
      "files:",
      `  - url: ${x64}`,
      "    sha512: x64-hash",
      "    size: 10",
      `  - url: ${arm64}`,
      "    sha512: arm64-hash",
      "    size: 11",
      `path: ${x64}`,
      "sha512: x64-hash",
    ].join("\n");

    expect(() => validateMacUpdateMetadataShape([x64, arm64], metadata)).not.toThrow();
    expect(() => validateMacUpdateMetadataShape([arm64], metadata)).toThrow(/exactly one x64/);
    expect(() => validateMacUpdateMetadataShape(
      [x64, arm64],
      metadata.replace(`path: ${x64}`, "path: missing.zip"),
    )).toThrow(/path does not reference/);
    expect(() => validateMacUpdateMetadataShape(
      [x64, arm64],
      metadata.replace("files:", [
        "files:",
        "  - url: Open-Video-Craft-1.0.2-mac-universal.zip",
        "    sha512: stale-hash",
        "    size: 12",
      ].join("\n")),
    )).toThrow(/do not exactly match/);
  });

});

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
