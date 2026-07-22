#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { validateFfmpegBinary } from "./verify-ffmpeg.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");

export const WINDOWS_FFMPEG = Object.freeze({
  archiveUrl: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-21-13-38/ffmpeg-n8.1.2-29-g703dcc25b9-win64-gpl-8.1.zip",
  archiveSha256: "ebf57e8b1a10b176b88c3cbc66e68a4aed472cf47520b0fbf003e892fb3be642",
  binarySha256: "070be6f5202e71a5e0bec88312230eebf2708f9b9ee3694596babf20902dddd2",
  buildCommit: "8c736b2d6fe5da2a10a8896d01e53bfb0ca4f665",
  ffmpegCommit: "703dcc25b91eacd2ab8b8b2fe888dc8d7ab4ad6d",
  version: "8.1.2"
});

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "Open-Video-Craft-Windows-FFmpeg-Preparer/1" },
    redirect: "follow",
    signal: AbortSignal.timeout(15 * 60 * 1000)
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}: ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: "wx" }));
}

async function findWindowsFfmpeg(directory) {
  const matches = [];
  async function visit(currentDirectory) {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase() === "ffmpeg.exe") matches.push(entryPath);
    }
  }
  await visit(directory);
  if (matches.length !== 1) {
    throw new Error(`Expected one ffmpeg.exe in the Windows archive, found ${matches.length}`);
  }
  return matches[0];
}

export function getPeArchitecture(buffer) {
  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") return null;
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) return null;
  const machine = buffer.readUInt16LE(peOffset + 4);
  return machine === 0x8664 ? "x64" : machine === 0xaa64 ? "arm64" : machine === 0x14c ? "ia32" : null;
}

export async function prepareWindowsFfmpeg() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(`Windows FFmpeg preparation requires Windows x64; received ${process.platform} ${process.arch}`);
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ovc-windows-ffmpeg-"));
  const archivePath = path.join(temporaryDirectory, "ffmpeg.zip");
  const extractDirectory = path.join(temporaryDirectory, "extracted");
  const destination = path.join(projectDirectory, "node_modules", "ffmpeg-static", "ffmpeg.exe");
  const temporaryDestination = `${destination}.${randomUUID()}.tmp`;

  try {
    await downloadFile(WINDOWS_FFMPEG.archiveUrl, archivePath);
    const archiveHash = await sha256File(archivePath);
    if (archiveHash !== WINDOWS_FFMPEG.archiveSha256) {
      throw new Error(`Windows FFmpeg archive checksum mismatch: expected ${WINDOWS_FFMPEG.archiveSha256}, received ${archiveHash}`);
    }

    await mkdir(extractDirectory, { recursive: true });
    await execFileAsync("tar.exe", ["-xf", archivePath, "-C", extractDirectory], {
      maxBuffer: 16 * 1024 * 1024
    });
    const extractedBinary = await findWindowsFfmpeg(extractDirectory);
    const binaryHash = await sha256File(extractedBinary);
    if (binaryHash !== WINDOWS_FFMPEG.binarySha256) {
      throw new Error(`Windows FFmpeg binary checksum mismatch: expected ${WINDOWS_FFMPEG.binarySha256}, received ${binaryHash}`);
    }

    await copyFile(extractedBinary, temporaryDestination);
    await validateFfmpegBinary(temporaryDestination);
    await rename(temporaryDestination, destination);
    process.stdout.write(`Prepared pinned Windows FFmpeg ${WINDOWS_FFMPEG.version}: ${destination}\n`);
    return destination;
  } finally {
    await rm(temporaryDestination, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  prepareWindowsFfmpeg().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
