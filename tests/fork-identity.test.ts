import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const UPSTREAM_TEAM_ID = "3XX79RB95N";

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("fork identity", () => {
  it("uses the fork appId and keeps the product name", () => {
    expect(packageJson.build.appId).toBe("dev.micio86dev.openvideocraft");
    expect(packageJson.build.productName).toBe("Open Video Craft");
  });

  it("publishes to the fork and never to upstream", () => {
    expect(packageJson.build.publish).toEqual({
      provider: "github",
      owner: "micio86dev",
      repo: "openvideocraft"
    });
    expect(JSON.stringify(packageJson.build)).not.toContain("Reubencfernandes");
    expect(packageJson.repository.url).toContain("micio86dev/openvideocraft");
  });

  it("does not hard-code upstream's Apple Team ID in release verification", () => {
    expect(read("scripts/verify-mac-release.mjs")).not.toContain(UPSTREAM_TEAM_ID);
    expect(read(".github/workflows/release.yml")).not.toContain(UPSTREAM_TEAM_ID);
  });

  it("targets the fork's own bundle id in the Mac App Store profile helper", () => {
    expect(read("scripts/prepare-mas-profile.mjs")).toContain(
      'const applicationBundleId = "dev.micio86dev.openvideocraft"'
    );
  });
});
