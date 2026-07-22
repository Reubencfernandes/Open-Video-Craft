import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateMacFfmpegBinary,
  validateMachOArchitectures,
} from "./verify-ffmpeg.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;
const appId = packageJson.build.appId;
const productName = packageJson.build.productName;
const expectedTeamIdentifier = process.env.OVC_MAC_TEAM_ID ?? "3XX79RB95N";
const releaseDirectory = join(projectRoot, "release", version);

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? "";
    throw new Error(`${command} ${args.join(" ")} failed.\n${stdout}${stderr}`.trim());
  }
}

export function getCheckedCommandOutput(command, args, spawn = spawnSync) {
  const result = spawn(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${String(result.status)}.\n${output}`.trim());
  }
  return output;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function getArchiveArchitectures(archiveName) {
  const match = basename(archiveName).match(/-mac-(x64|arm64|universal)\.zip$/);
  if (!match) {
    throw new Error(`Cannot determine macOS architecture from update archive: ${archiveName}`);
  }
  return match[1] === "universal" ? ["x64", "arm64"] : [match[1]];
}

function findMacUpdateArchives() {
  assert(existsSync(releaseDirectory), `Release directory does not exist: ${releaseDirectory}`);

  return readdirSync(releaseDirectory)
    .filter((name) => name.endsWith(".zip") && name.includes("-mac-"))
    .map((name) => join(releaseDirectory, name))
    .sort();
}

function getMetadataEntries(metadata) {
  const entries = new Map();
  const expression = /^\s*-\s+url:\s*(.+)\r?\n\s+sha512:\s*(.+)\r?\n\s+size:\s*(\d+)$/gm;

  for (const match of metadata.matchAll(expression)) {
    entries.set(match[1].trim(), { sha512: match[2].trim(), size: Number(match[3]) });
  }

  return entries;
}

export function validateMacUpdateMetadataShape(archiveNames, metadata) {
  const names = archiveNames.map((archiveName) => basename(archiveName));
  const archiveKinds = names.map((archiveName) => {
    const architectures = getArchiveArchitectures(archiveName);
    return architectures.length === 2 ? "universal" : architectures[0];
  });
  const hasCompleteThinSet = names.length === 2
    && archiveKinds.filter((kind) => kind === "x64").length === 1
    && archiveKinds.filter((kind) => kind === "arm64").length === 1;
  const hasUniversalSet = names.length === 1 && archiveKinds[0] === "universal";
  assert(
    hasCompleteThinSet || hasUniversalSet,
    `macOS release must contain exactly one x64 and one arm64 ZIP, or one universal ZIP. Found: ${names.join(", ") || "none"}`,
  );

  const entries = getMetadataEntries(metadata);
  const metadataZipNames = [...entries.keys()]
    .filter((name) => name.endsWith(".zip") && name.includes("-mac-"));
  const archiveNameSet = new Set(names);
  assert(
    metadataZipNames.length === names.length
      && metadataZipNames.every((name) => archiveNameSet.has(name)),
    `latest-mac.yml ZIP entries do not exactly match release archives. Metadata: ${metadataZipNames.join(", ") || "none"}; disk: ${names.join(", ") || "none"}`,
  );

  const defaultPathMatch = metadata.match(/^path:\s*(.+)$/m);
  assert(defaultPathMatch, "latest-mac.yml does not declare a default path.");
  const defaultPath = defaultPathMatch[1].trim();
  assert(archiveNameSet.has(defaultPath), `latest-mac.yml path does not reference a release ZIP: ${defaultPath}`);

  return entries;
}

function verifyUpdateMetadata(archives) {
  const metadataPath = join(releaseDirectory, "latest-mac.yml");
  assert(existsSync(metadataPath), `Missing macOS update metadata: ${metadataPath}`);

  const metadata = readFileSync(metadataPath, "utf8");
  assert(metadata.includes(`version: ${version}`), "latest-mac.yml does not declare the package version.");

  const entries = validateMacUpdateMetadataShape(archives, metadata);
  for (const archive of archives) {
    const name = basename(archive);
    const entry = entries.get(name);
    assert(entry, `latest-mac.yml does not contain update metadata for ${name}.`);

    const content = readFileSync(archive);
    const sha512 = createHash("sha512").update(content).digest("base64");
    assert(entry.sha512 === sha512, `SHA-512 mismatch between latest-mac.yml and ${name}.`);
    assert(entry.size === statSync(archive).size, `Size mismatch between latest-mac.yml and ${name}.`);
  }
}

export function getEmbeddedFfmpegTargets(
  appPath,
  archiveArchitectures,
  exists = existsSync,
) {
  const resourcesDirectory = join(appPath, "Contents", "Resources");
  const ffmpegRelativePath = join("node_modules", "ffmpeg-static", "ffmpeg");
  const mergedPath = join(resourcesDirectory, "app.asar.unpacked", ffmpegRelativePath);

  if (exists(mergedPath)) {
    return [{ binaryPath: mergedPath, architectures: archiveArchitectures }];
  }

  if (archiveArchitectures.length === 2) {
    const splitTargets = [
      {
        binaryPath: join(resourcesDirectory, "app-x64.asar.unpacked", ffmpegRelativePath),
        architectures: ["x64"],
      },
      {
        binaryPath: join(resourcesDirectory, "app-arm64.asar.unpacked", ffmpegRelativePath),
        architectures: ["arm64"],
      },
    ];
    if (splitTargets.every(({ binaryPath }) => exists(binaryPath))) {
      return splitTargets;
    }
  }

  throw new Error(`Packaged FFmpeg was not found in ${appPath}`);
}

async function verifyEmbeddedFfmpeg(appPath, archive, archiveArchitectures) {
  const targets = getEmbeddedFfmpegTargets(appPath, archiveArchitectures);

  for (const { binaryPath, architectures } of targets) {
    await validateMacFfmpegBinary(binaryPath, architectures);
    run("codesign", ["--verify", "--strict", "--verbose=2", binaryPath]);
    const signingDetails = getCheckedCommandOutput("codesign", ["-dv", "--verbose=4", binaryPath]);

    assert(signingDetails.includes("Authority=Developer ID Application:"), `${basename(archive)} contains FFmpeg without a Developer ID Application signature.`);
    assert(!signingDetails.includes("Signature=adhoc"), `${basename(archive)} contains an ad-hoc signed FFmpeg binary.`);
    assert(signingDetails.includes(`TeamIdentifier=${expectedTeamIdentifier}`), `${basename(archive)} contains FFmpeg signed by the wrong team. Expected ${expectedTeamIdentifier}.`);
  }
}

async function verifyArchive(archive) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "open-video-craft-release-"));

  try {
    run("ditto", ["-x", "-k", archive, temporaryDirectory]);
    const appPath = join(temporaryDirectory, `${productName}.app`);
    assert(existsSync(appPath), `${basename(archive)} does not contain ${productName}.app.`);
    const archiveArchitectures = getArchiveArchitectures(archive);
    const appExecutable = join(appPath, "Contents", "MacOS", productName);
    await validateMachOArchitectures(
      appExecutable,
      archiveArchitectures,
      "Application executable",
    );

    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    const signingDetails = getCheckedCommandOutput("codesign", ["-dv", "--verbose=4", appPath]);
    const designatedRequirement = getCheckedCommandOutput("codesign", ["-d", "-r-", appPath]);
    const plist = join(appPath, "Contents", "Info.plist");

    assert(signingDetails.includes("Authority=Developer ID Application:"), `${basename(archive)} is not signed with a Developer ID Application certificate.`);
    assert(!signingDetails.includes("Signature=adhoc"), `${basename(archive)} is ad-hoc signed and cannot be shipped through auto-update.`);
    assert(signingDetails.includes(`TeamIdentifier=${expectedTeamIdentifier}`), `${basename(archive)} was signed by the wrong team. Expected ${expectedTeamIdentifier}.`);
    assert(signingDetails.includes("Notarization Ticket=stapled"), `${basename(archive)} has no stapled notarization ticket.`);
    assert(designatedRequirement.includes(`identifier \"${appId}\"`), `${basename(archive)} has the wrong bundle identifier requirement.`);
    assert(designatedRequirement.includes(`subject.OU] = \"${expectedTeamIdentifier}\"`), `${basename(archive)} has an incompatible designated signing requirement.`);
    assert(run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist]).trim() === appId, `${basename(archive)} has an unexpected bundle identifier.`);
    assert(run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist]).trim() === version, `${basename(archive)} has an unexpected version.`);

    const thirdPartyNotices = join(appPath, "Contents", "Resources", "THIRD_PARTY_NOTICES.md");
    assert(existsSync(thirdPartyNotices), `${basename(archive)} does not contain THIRD_PARTY_NOTICES.md.`);
    const sourceOffer = join(appPath, "Contents", "Resources", "FFMPEG_SOURCE_OFFER.md");
    assert(existsSync(sourceOffer), `${basename(archive)} does not contain FFMPEG_SOURCE_OFFER.md.`);
    const buildNotes = join(appPath, "Contents", "Resources", "FFMPEG_MACOS_BUILD_NOTES.md");
    assert(existsSync(buildNotes), `${basename(archive)} does not contain FFMPEG_MACOS_BUILD_NOTES.md.`);
    await verifyEmbeddedFfmpeg(appPath, archive, archiveArchitectures);

    const assessment = getCheckedCommandOutput("spctl", ["-a", "-vv", appPath]);
    assert(assessment.includes("accepted") && assessment.includes("Notarized Developer ID"), `${basename(archive)} failed Gatekeeper assessment.\n${assessment}`);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

export async function main() {
  if (process.platform !== "darwin") {
    throw new Error("macOS release verification must run on macOS.");
  }

  const archives = findMacUpdateArchives();
  assert(archives.length > 0, `No macOS update ZIP archives found in ${releaseDirectory}.`);
  verifyUpdateMetadata(archives);
  for (const archive of archives) {
    await verifyArchive(archive);
  }
  console.log(`Verified ${archives.length} notarized macOS update archive(s) for team ${expectedTeamIdentifier}.`);
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(`macOS release verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
