import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPeArchitecture, WINDOWS_FFMPEG } from "./prepare-windows-ffmpeg.mjs";
import { validateFfmpegBinary } from "./verify-ffmpeg.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;
const releaseDirectory = join(projectRoot, "release", version);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateWindowsUpdateMetadataShape(artifactNames, metadata) {
  const setupName = artifactNames.find((name) => name.includes("Setup") && name.endsWith(".exe"));
  const portableName = artifactNames.find((name) => name.includes("Portable") && name.endsWith(".exe"));
  assert(setupName, "Windows release is missing the NSIS Setup executable.");
  assert(portableName, "Windows release is missing the Portable executable.");
  assert(metadata.includes(`version: ${version}`), "latest.yml does not declare the package version.");
  assert(metadata.includes(setupName), "latest.yml does not reference the NSIS Setup executable.");
  return { setupName, portableName };
}

export async function main() {
  if (process.platform !== "win32") throw new Error("Windows release verification must run on Windows.");
  assert(existsSync(releaseDirectory), `Release directory does not exist: ${releaseDirectory}`);

  const names = readdirSync(releaseDirectory);
  const metadataPath = join(releaseDirectory, "latest.yml");
  assert(existsSync(metadataPath), `Missing Windows update metadata: ${metadataPath}`);
  const artifacts = validateWindowsUpdateMetadataShape(names, readFileSync(metadataPath, "utf8"));
  for (const name of [artifacts.setupName, artifacts.portableName]) {
    assert(statSync(join(releaseDirectory, name)).size > 0, `${name} is empty.`);
  }

  const packagedFfmpeg = join(
    releaseDirectory,
    "win-unpacked",
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "ffmpeg-static",
    "ffmpeg.exe"
  );
  assert(existsSync(packagedFfmpeg), `Packaged Windows FFmpeg was not found: ${packagedFfmpeg}`);
  const header = readFileSync(packagedFfmpeg).subarray(0, 4096);
  assert(getPeArchitecture(header) === "x64", `Packaged FFmpeg is not a Windows x64 PE executable: ${packagedFfmpeg}`);
  await validateFfmpegBinary(packagedFfmpeg);

  console.log(`Verified Windows ${version} Setup and Portable artifacts with FFmpeg ${WINDOWS_FFMPEG.version}: ${basename(packagedFfmpeg)}`);
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(`Windows release verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
