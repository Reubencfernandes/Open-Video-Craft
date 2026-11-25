/**
 * Prepares the optional `ovc-click-capture` sidecar for packaging.
 *
 * The sidecar records global clicks so a screen recording can seed editable
 * automatic zooms. It needs the Swift toolchain, which a release machine may
 * not have: a missing toolchain must not break packaging, so this script warns
 * and leaves the directory without the binary. The app then reports that
 * automatic zooms are unavailable instead of silently producing none.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageRoot = path.join(repoRoot, "native", "capture-poc");
const binaryName = "ovc-click-capture";
const outputDirectory = path.join(repoRoot, "resources", "bin");
const outputPath = path.join(outputDirectory, binaryName);

function hasSwift() {
  try {
    execFileSync("swift", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

fs.mkdirSync(outputDirectory, { recursive: true });

if (!hasSwift()) {
  fs.rmSync(outputPath, { force: true });
  console.warn(
    "[click-capture] Swift is not installed; packaging without the click sidecar. Automatic zooms will be unavailable in this build."
  );
  process.exit(0);
}

try {
  execFileSync("swift", ["build", "-c", "release", "--package-path", packageRoot], {
    stdio: "inherit"
  });
} catch (error) {
  fs.rmSync(outputPath, { force: true });
  console.warn(
    `[click-capture] The sidecar did not build (${error instanceof Error ? error.message : error}); packaging without automatic zooms.`
  );
  process.exit(0);
}

const builtPath = path.join(packageRoot, ".build", "release", binaryName);
if (!fs.existsSync(builtPath)) {
  fs.rmSync(outputPath, { force: true });
  console.warn(`[click-capture] ${builtPath} is missing; packaging without automatic zooms.`);
  process.exit(0);
}

fs.copyFileSync(builtPath, outputPath);
fs.chmodSync(outputPath, 0o755);
console.log(`[click-capture] prepared ${path.relative(repoRoot, outputPath)}`);
