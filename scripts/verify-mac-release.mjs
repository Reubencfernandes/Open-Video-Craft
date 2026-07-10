import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function getCommandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function verifyUpdateMetadata(archives) {
  const metadataPath = join(releaseDirectory, "latest-mac.yml");
  assert(existsSync(metadataPath), `Missing macOS update metadata: ${metadataPath}`);

  const metadata = readFileSync(metadataPath, "utf8");
  assert(metadata.includes(`version: ${version}`), "latest-mac.yml does not declare the package version.");

  const entries = getMetadataEntries(metadata);
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

function verifyArchive(archive) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "open-video-craft-release-"));

  try {
    run("ditto", ["-x", "-k", archive, temporaryDirectory]);
    const appPath = join(temporaryDirectory, `${productName}.app`);
    assert(existsSync(appPath), `${basename(archive)} does not contain ${productName}.app.`);

    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    const signingDetails = getCommandOutput("codesign", ["-dv", "--verbose=4", appPath]);
    const designatedRequirement = getCommandOutput("codesign", ["-d", "-r-", appPath]);
    const plist = join(appPath, "Contents", "Info.plist");

    assert(signingDetails.includes("Authority=Developer ID Application:"), `${basename(archive)} is not signed with a Developer ID Application certificate.`);
    assert(!signingDetails.includes("Signature=adhoc"), `${basename(archive)} is ad-hoc signed and cannot be shipped through auto-update.`);
    assert(signingDetails.includes(`TeamIdentifier=${expectedTeamIdentifier}`), `${basename(archive)} was signed by the wrong team. Expected ${expectedTeamIdentifier}.`);
    assert(signingDetails.includes("Notarization Ticket=stapled"), `${basename(archive)} has no stapled notarization ticket.`);
    assert(designatedRequirement.includes(`identifier \"${appId}\"`), `${basename(archive)} has the wrong bundle identifier requirement.`);
    assert(designatedRequirement.includes(`subject.OU] = \"${expectedTeamIdentifier}\"`), `${basename(archive)} has an incompatible designated signing requirement.`);
    assert(run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist]).trim() === appId, `${basename(archive)} has an unexpected bundle identifier.`);
    assert(run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist]).trim() === version, `${basename(archive)} has an unexpected version.`);

    const assessment = getCommandOutput("spctl", ["-a", "-vv", appPath]);
    assert(assessment.includes("accepted") && assessment.includes("Notarized Developer ID"), `${basename(archive)} failed Gatekeeper assessment.\n${assessment}`);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

if (process.platform !== "darwin") {
  console.error("macOS release verification must run on macOS.");
  process.exit(1);
}

try {
  const archives = findMacUpdateArchives();
  assert(archives.length > 0, `No macOS update ZIP archives found in ${releaseDirectory}.`);
  verifyUpdateMetadata(archives);
  archives.forEach(verifyArchive);
  console.log(`Verified ${archives.length} notarized macOS update archive(s) for team ${expectedTeamIdentifier}.`);
} catch (error) {
  console.error(`macOS release verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
