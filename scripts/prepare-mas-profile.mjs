#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const applicationBundleId = "dev.micio86dev.openvideocraft";
const destinationPath = path.join(projectDirectory, "build", "mas.provisionprofile");

function extractProfileValue(profileXml, key, valueTag) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `<key>${escapedKey}</key>\\s*<${valueTag}>([^<]+)</${valueTag}>`
  );
  return profileXml.match(expression)?.[1]?.trim() ?? null;
}

export function readProfileMetadata(profileXml) {
  const applicationIdentifier = extractProfileValue(
    profileXml,
    "com.apple.application-identifier",
    "string"
  );
  const expirationValue = extractProfileValue(profileXml, "ExpirationDate", "date");
  const expirationDate = expirationValue ? new Date(expirationValue) : null;

  return {
    applicationIdentifier,
    expirationDate:
      expirationDate && Number.isFinite(expirationDate.getTime())
        ? expirationDate
        : null
  };
}

async function decodeProfile(profilePath) {
  const { stdout } = await execFileAsync(
    "/usr/bin/security",
    ["cms", "-D", "-i", profilePath],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );
  return stdout;
}

async function listProfiles(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          (entry.name.endsWith(".provisionprofile") ||
            entry.name.endsWith(".mobileprovision"))
      )
      .map((entry) => path.join(directory, entry.name));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function resolveProfile() {
  const overridePath = process.env.OVC_MAS_PROVISIONING_PROFILE?.trim();
  if (overridePath) {
    const resolvedOverride = path.resolve(overridePath);
    await access(resolvedOverride);
    return resolvedOverride;
  }

  const profileDirectories = [
    path.join(
      os.homedir(),
      "Library",
      "Developer",
      "Xcode",
      "UserData",
      "Provisioning Profiles"
    ),
    path.join(os.homedir(), "Library", "MobileDevice", "Provisioning Profiles")
  ];
  const candidates = (
    await Promise.all(profileDirectories.map((directory) => listProfiles(directory)))
  ).flat();
  const matchingProfiles = [];

  for (const profilePath of candidates) {
    try {
      const metadata = readProfileMetadata(await decodeProfile(profilePath));
      if (
        metadata.applicationIdentifier?.endsWith(`.${applicationBundleId}`) &&
        metadata.expirationDate &&
        metadata.expirationDate.getTime() > Date.now()
      ) {
        matchingProfiles.push({ profilePath, ...metadata });
      }
    } catch {
      // Ignore profiles that cannot be decoded; another installed profile may match.
    }
  }

  matchingProfiles.sort(
    (left, right) =>
      right.expirationDate.getTime() - left.expirationDate.getTime()
  );
  const selectedProfile = matchingProfiles[0];
  if (!selectedProfile) {
    throw new Error(
      `No unexpired Mac App Store provisioning profile for ${applicationBundleId} was found. ` +
        "Install one through Xcode or set OVC_MAS_PROVISIONING_PROFILE."
    );
  }
  return selectedProfile.profilePath;
}

export async function main() {
  if (process.platform !== "darwin") {
    throw new Error("Mac App Store provisioning profiles can only be prepared on macOS.");
  }

  const sourcePath = await resolveProfile();
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  process.stdout.write(`Prepared Mac App Store profile: ${sourcePath}\n`);
  process.stdout.write(`Embedded profile input: ${destinationPath}\n`);
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
