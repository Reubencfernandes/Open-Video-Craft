import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

let cachedProductVersion: string | null = null;

export function getProductVersion(): string {
  if (cachedProductVersion) {
    return cachedProductVersion;
  }

  cachedProductVersion = app.isPackaged
    ? app.getVersion()
    : readDevPackageVersion() ?? app.getVersion();

  return cachedProductVersion;
}

function readDevPackageVersion(): string | null {
  const candidatePaths = [
    path.join(process.cwd(), "package.json"),
    path.join(app.getAppPath(), "package.json")
  ];

  for (const packagePath of candidatePaths) {
    const version = readPackageVersion(packagePath);
    if (version) {
      return version;
    }
  }

  return null;
}

function readPackageVersion(packagePath: string): string | null {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}
