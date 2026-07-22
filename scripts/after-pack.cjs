"use strict";

const { randomUUID } = require("node:crypto");
const { constants: fsConstants } = require("node:fs");
const {
  access,
  chmod,
  copyFile,
  mkdir,
  rename,
  rm,
} = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Arch } = require("builder-util");

let validatorModulePromise;

function loadValidatorModule() {
  if (!validatorModulePromise) {
    const validatorUrl = pathToFileURL(path.join(__dirname, "verify-ffmpeg.mjs")).href;
    validatorModulePromise = import(validatorUrl);
  }
  return validatorModulePromise;
}

function getArchitectureName(architecture) {
  if (typeof architecture === "string") return architecture;
  return Arch[architecture];
}

function getCopyOperations(context) {
  const architecture = getArchitectureName(context.arch);

  if (architecture === "x64" || architecture === "arm64") {
    return [{ architecture, unpackedDirectory: "app.asar.unpacked" }];
  }

  if (architecture === "universal") {
    // The two thin builds have already passed through this hook. The final
    // universal pass validates @electron/universal's merged output in place.
    return [];
  }

  throw new Error(`Unsupported macOS electron-builder architecture: ${String(architecture)}`);
}

function getFfmpegPath(resourcesDirectory, unpackedDirectory) {
  return path.join(
    resourcesDirectory,
    unpackedDirectory,
    "node_modules",
    "ffmpeg-static",
    "ffmpeg",
  );
}

function getUniversalBinaryCandidates(resourcesDirectory) {
  return {
    merged: {
      binaryPath: getFfmpegPath(resourcesDirectory, "app.asar.unpacked"),
      architectures: ["x64", "arm64"],
      layout: "merged",
    },
    split: [
      {
        binaryPath: getFfmpegPath(resourcesDirectory, "app-x64.asar.unpacked"),
        architectures: ["x64"],
        layout: "split-x64",
      },
      {
        binaryPath: getFfmpegPath(resourcesDirectory, "app-arm64.asar.unpacked"),
        architectures: ["arm64"],
        layout: "split-arm64",
      },
    ],
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.R_OK | fsConstants.X_OK);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveUniversalValidationTargets(resourcesDirectory, exists = pathExists) {
  const candidates = getUniversalBinaryCandidates(resourcesDirectory);
  const [mergedPresent, ...splitPresence] = await Promise.all([
    exists(candidates.merged.binaryPath),
    ...candidates.split.map(({ binaryPath }) => exists(binaryPath)),
  ]);

  if (mergedPresent && splitPresence.some(Boolean)) {
    throw new Error("Universal FFmpeg layout is ambiguous: merged and split binaries both exist");
  }
  if (mergedPresent) {
    return [candidates.merged];
  }
  if (splitPresence.every(Boolean)) {
    return candidates.split;
  }

  const checkedPaths = [
    candidates.merged.binaryPath,
    ...candidates.split.map(({ binaryPath }) => binaryPath),
  ];
  throw new Error(
    `Universal FFmpeg layout is incomplete. Checked:\n- ${checkedPaths.join("\n- ")}`,
  );
}

async function atomicallyReplaceBinary(sourcePath, destinationPath, architecture) {
  const { validateMacFfmpegBinary } = await loadValidatorModule();

  await access(sourcePath, fsConstants.R_OK | fsConstants.X_OK);
  await validateMacFfmpegBinary(sourcePath, [architecture]);

  // The destination must already have been emitted by electron-builder's asarUnpack.
  // Refusing to create it prevents a silently unused FFmpeg copy when the package layout changes.
  await access(destinationPath, fsConstants.R_OK);
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

async function afterPack(context) {
  if (context.electronPlatformName !== "darwin" && context.electronPlatformName !== "mas") {
    return;
  }

  if (!context.packager || typeof context.packager.getResourcesDir !== "function") {
    throw new Error("electron-builder afterPack context is missing packager.getResourcesDir(appOutDir)");
  }

  const projectDirectory = context.packager.projectDir;
  if (typeof projectDirectory !== "string" || projectDirectory.length === 0) {
    throw new Error("electron-builder afterPack context is missing packager.projectDir");
  }

  const resourcesDirectory = context.packager.getResourcesDir(context.appOutDir);
  const architecture = getArchitectureName(context.arch);

  // Local ACE-Step setup launches an external Python environment, which is not
  // compatible with the Mac App Store sandbox. The MAS runtime already hides
  // the feature; remove its helper script from the submitted bundle as well.
  if (context.electronPlatformName === "mas") {
    await rm(path.join(resourcesDirectory, "acestep_generate.py"), { force: true });
  }

  if (architecture === "universal") {
    const { validateMacFfmpegBinary } = await loadValidatorModule();
    const targets = await resolveUniversalValidationTargets(resourcesDirectory);

    for (const target of targets) {
      const { runtimeValidated } = await validateMacFfmpegBinary(
        target.binaryPath,
        target.architectures,
      );
      console.log(
        `[afterPack] Validated ${target.layout} universal FFmpeg (${target.architectures.join("+")}; runtime=${runtimeValidated}): ${target.binaryPath}`,
      );
    }
    return;
  }

  const operations = getCopyOperations(context);

  for (const { architecture, unpackedDirectory } of operations) {
    const sourcePath = path.join(
      projectDirectory,
      ".ffmpeg-bin",
      `darwin-${architecture}`,
      "ffmpeg",
    );
    const destinationPath = getFfmpegPath(resourcesDirectory, unpackedDirectory);

    await atomicallyReplaceBinary(sourcePath, destinationPath, architecture);
    console.log(`[afterPack] Installed validated macOS ${architecture} FFmpeg: ${destinationPath}`);
  }
}

module.exports = afterPack;
module.exports.getArchitectureName = getArchitectureName;
module.exports.getCopyOperations = getCopyOperations;
module.exports.getUniversalBinaryCandidates = getUniversalBinaryCandidates;
module.exports.resolveUniversalValidationTargets = resolveUniversalValidationTargets;
