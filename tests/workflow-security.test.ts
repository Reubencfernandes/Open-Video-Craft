import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const workflowsDirectory = path.join(repositoryRoot, ".github/workflows");
const workflowFiles = readdirSync(workflowsDirectory).filter((file) => file.endsWith(".yml"));

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function actionReferences(text: string): string[] {
  return [...text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1] ?? "");
}

describe("workflow security", () => {
  it("pins every external action to a full commit SHA", () => {
    const unpinned = workflowFiles.flatMap((file) =>
      actionReferences(read(`.github/workflows/${file}`)).filter((reference) => {
        const commit = reference.split("@")[1] ?? "";
        return !/^[0-9a-f]{40}$/.test(commit);
      })
    );
    expect(unpinned).toEqual([]);
  });

  it("drops Windows from CI and release workflows", () => {
    const ci = read(".github/workflows/ci.yml");
    const release = read(".github/workflows/release.yml");
    expect(ci).toContain("name: Verify (macos-latest)");
    expect(ci).toContain("runs-on: macos-latest");
    expect(ci).not.toContain("windows-latest");
    expect(release).not.toContain("windows-latest");
    expect(release).toContain("--x64 --arm64 --publish never");
    expect(release).toContain("release/*/*.blockmap");
    expect(release).toContain("macOS Apple Silicon and Intel builds");
    expect(read("package.json")).toContain("dist:mac:universal");
  });

  it("uses least-privilege workflow permissions", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(read(".github/workflows/release.yml")).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(read(".github/workflows/release.yml")).toContain("contents: write");
  });

  it("runs the runtime audit and keeps action pins updated", () => {
    expect(read(".github/workflows/ci.yml")).toContain("npm audit --omit=dev --audit-level=high");
    expect(existsSync(path.join(repositoryRoot, ".github/dependabot.yml"))).toBe(true);
    const dependabot = read(".github/dependabot.yml");
    expect(dependabot).toContain("package-ecosystem: \"github-actions\"");
    expect(dependabot).toContain("package-ecosystem: \"npm\"");
  });

  it("records the CI and coverage decisions in ADR-14", () => {
    const adr = read("ADR.md");
    expect(adr).toContain("ADR-14");
    expect(adr).toContain("@vitest/coverage-v8");
  });

});
