import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("pinned Electron", () => {
  it("pins an exact Electron version of at least 43.8.1", () => {
    const version: string = packageJson.devDependencies.electron;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const [major, minor, patch] = version.split(".").map(Number);
    const atLeast = major > 43 || (major === 43 && (minor > 8 || (minor === 8 && patch >= 1)));
    expect(atLeast).toBe(true);
  });

  it("records the same version in the lockfile", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.packages["node_modules/electron"].version).toBe(packageJson.devDependencies.electron);
  });
});
