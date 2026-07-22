#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream, createWriteStream } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  getInstalledFfmpegPath,
  validateFfmpegBinary,
  validateMacFfmpegBinary,
} from "./verify-ffmpeg.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const unzipPath = "/usr/bin/unzip";

export const MAC_FFMPEG_ARCHIVES = Object.freeze({
  arm64: Object.freeze({
    url: "https://ffmpeg.martin-riedl.de/download/macos/arm64/1783011502_8.1.2/ffmpeg.zip",
    sha256: "ef1aa60006c7b77ce170c1608c08d8e4ba1c30c5746f2ac986ded932d0ac2c3c",
  }),
  x64: Object.freeze({
    url: "https://ffmpeg.martin-riedl.de/download/macos/amd64/1783018342_8.1.2/ffmpeg.zip",
    sha256: "a52ef43883f44c219766d4b3bdde4e635b35465d0b704c01c3a0566b59775df9",
  }),
});

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "Open-Video-Craft-FFmpeg-Preparer/1" },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok || response.body === null) {
    throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}: ${url}`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination, { flags: "wx" }),
  );
}

async function findExtractedFfmpeg(directory) {
  const matches = [];

  async function visit(currentDirectory) {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === "ffmpeg") {
        matches.push(entryPath);
      }
    }
  }

  await visit(directory);
  if (matches.length !== 1) {
    throw new Error(`Expected one ffmpeg executable in the archive, found ${matches.length}`);
  }
  return matches[0];
}

async function atomicallyInstallBinary(sourcePath, destinationPath, architecture) {
  const destinationDirectory = path.dirname(destinationPath);
  await mkdir(destinationDirectory, { recursive: true });

  const temporaryPath = path.join(
    destinationDirectory,
    `.ffmpeg-${process.pid}-${randomUUID()}.tmp`,
  );

  try {
    await copyFile(sourcePath, temporaryPath, fsConstants.COPYFILE_EXCL);
    await chmod(temporaryPath, 0o755);
    await validateMacFfmpegBinary(temporaryPath, [architecture]);
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function prepareArchitecture(architecture) {
  const archive = MAC_FFMPEG_ARCHIVES[architecture];
  if (!archive) {
    throw new Error(`Unsupported macOS architecture: ${architecture}`);
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), `ovc-ffmpeg-${architecture}-`));
  const archivePath = path.join(temporaryDirectory, "ffmpeg.zip");
  const extractDirectory = path.join(temporaryDirectory, "extracted");
  const preparedPath = path.join(
    projectDirectory,
    ".ffmpeg-bin",
    `darwin-${architecture}`,
    "ffmpeg",
  );

  try {
    process.stdout.write(`Downloading pinned FFmpeg 8.1.2 for macOS ${architecture}...\n`);
    await downloadFile(archive.url, archivePath);

    const actualChecksum = await sha256File(archivePath);
    if (actualChecksum !== archive.sha256) {
      throw new Error(
        `Checksum mismatch for macOS ${architecture}: expected ${archive.sha256}, received ${actualChecksum}`,
      );
    }

    await mkdir(extractDirectory, { recursive: true });
    await execFileAsync(unzipPath, ["-q", archivePath, "-d", extractDirectory], {
      maxBuffer: 16 * 1024 * 1024,
    });

    const extractedBinary = await findExtractedFfmpeg(extractDirectory);
    const extractedStats = await stat(extractedBinary);
    if (!extractedStats.isFile()) {
      throw new Error(`Extracted FFmpeg is not a regular file: ${extractedBinary}`);
    }
    await chmod(extractedBinary, 0o755);
    await validateMacFfmpegBinary(extractedBinary, [architecture]);
    await atomicallyInstallBinary(extractedBinary, preparedPath, architecture);

    process.stdout.write(`Prepared release FFmpeg: ${preparedPath}\n`);
    return preparedPath;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function installForLocalDevelopment(preparedPath) {
  const ffmpegStaticDirectory = path.join(projectDirectory, "node_modules", "ffmpeg-static");
  await access(ffmpegStaticDirectory, fsConstants.R_OK | fsConstants.W_OK);
  const installedPath = path.join(ffmpegStaticDirectory, "ffmpeg");
  await atomicallyInstallBinary(preparedPath, installedPath, process.arch);
  process.stdout.write(`Updated local ffmpeg-static binary: ${installedPath}\n`);
}

function parseArguments(argumentsToParse) {
  if (argumentsToParse.includes("--help")) {
    process.stdout.write("Usage: node scripts/prepare-ffmpeg.mjs [--all-mac]\n");
    return { help: true, allMac: false };
  }

  const unexpectedArguments = argumentsToParse.filter((argument) => argument !== "--all-mac");
  if (unexpectedArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unexpectedArguments.join(" ")}`);
  }

  return { help: false, allMac: argumentsToParse.includes("--all-mac") };
}

export async function main(argumentsToParse = process.argv.slice(2)) {
  const { help, allMac } = parseArguments(argumentsToParse);
  if (help) return;

  if (process.platform !== "darwin") {
    if (allMac) {
      throw new Error("--all-mac can only prepare pinned FFmpeg archives on macOS");
    }
    const installedPath = getInstalledFfmpegPath();
    await validateFfmpegBinary(installedPath);
    process.stdout.write(`Verified platform-provided ffmpeg-static binary: ${installedPath}\n`);
    return;
  }
  if (!(process.arch in MAC_FFMPEG_ARCHIVES)) {
    throw new Error(`Unsupported current macOS architecture: ${process.arch}`);
  }

  await access(unzipPath, fsConstants.X_OK);
  const architectures = allMac ? Object.keys(MAC_FFMPEG_ARCHIVES) : [process.arch];
  const preparedPaths = new Map();
  for (const architecture of architectures) {
    preparedPaths.set(architecture, await prepareArchitecture(architecture));
  }

  await installForLocalDevelopment(preparedPaths.get(process.arch));
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
