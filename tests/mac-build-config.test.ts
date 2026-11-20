import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("macOS build targets", () => {
  it("builds x64 and arm64 and sets a minimum system version", () => {
    const targets = packageJson.build.mac.target as Array<string | { target: string; arch?: string[] }>;
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(typeof target).toBe("object");
      expect((target as { arch?: string[] }).arch).toEqual(["x64", "arm64"]);
    }
    expect(packageJson.build.mac.minimumSystemVersion).toMatch(/^\d+(\.\d+){0,2}$/);
  });
});
