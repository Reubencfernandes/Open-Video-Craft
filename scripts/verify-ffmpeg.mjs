import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const lipoPath = "/usr/bin/lipo";
const stringsPath = "/usr/bin/strings";

const REQUIRED_CONFIGURATION_FLAGS = ["--enable-libx264", "--enable-libvpx"];
const REQUIRED_ENCODERS = ["libx264", "libvpx-vp9"];
const REQUIRED_FILTERS = ["drawtext", "subtitles"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWhitespaceDelimitedToken(output, token) {
  return new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`).test(output);
}

function collectConfigurationProblems(output) {
  const problems = [];

  if (containsWhitespaceDelimitedToken(output, "--enable-nonfree")) {
    problems.push("was built with --enable-nonfree");
  }

  for (const flag of REQUIRED_CONFIGURATION_FLAGS) {
    if (!containsWhitespaceDelimitedToken(output, flag)) {
      problems.push(`is missing configuration flag ${flag}`);
    }
  }

  return problems;
}

function containsListedCapability(output, capability) {
  const escapedCapability = escapeRegExp(capability);
  return new RegExp(`^\\s*\\S+\\s+${escapedCapability}(?:\\s|$)`, "m").test(output);
}

export function validateFfmpegOutputs({ versionOutput, encoderOutput, filterOutput }, binaryLabel = "FFmpeg") {
  const problems = collectConfigurationProblems(versionOutput);

  for (const encoder of REQUIRED_ENCODERS) {
    if (!containsListedCapability(encoderOutput, encoder)) {
      problems.push(`is missing encoder ${encoder}`);
    }
  }

  for (const filter of REQUIRED_FILTERS) {
    if (!containsListedCapability(filterOutput, filter)) {
      problems.push(`is missing filter ${filter}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`${binaryLabel} failed release validation:\n- ${problems.join("\n- ")}`);
  }
}

function containsExactString(output, value) {
  const escapedValue = escapeRegExp(value);
  return new RegExp(`^${escapedValue}$`, "m").test(output);
}

/**
 * Inspect markers embedded in a Mach-O without executing it. This is the
 * cross-architecture fallback used on Macs that cannot run the other slice.
 * Archive checksums establish provenance; these markers make packaging fail
 * if a signed artifact nevertheless contains a nonfree or incapable binary.
 */
export function validateFfmpegStaticStrings(stringsOutput, binaryLabel = "FFmpeg") {
  const problems = collectConfigurationProblems(stringsOutput);

  for (const capability of [...REQUIRED_ENCODERS, ...REQUIRED_FILTERS]) {
    if (!containsExactString(stringsOutput, capability)) {
      problems.push(`does not contain capability marker ${capability}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`${binaryLabel} failed static release validation:\n- ${problems.join("\n- ")}`);
  }
}

async function capture(binaryPath, args) {
  const { stdout, stderr } = await execFileAsync(binaryPath, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return `${stdout}\n${stderr}`;
}

export async function validateFfmpegBinary(binaryPath) {
  const resolvedPath = path.resolve(binaryPath);
  await access(resolvedPath, fsConstants.R_OK | fsConstants.X_OK);

  let versionOutput;
  let encoderOutput;
  let filterOutput;

  try {
    [versionOutput, encoderOutput, filterOutput] = await Promise.all([
      capture(resolvedPath, ["-hide_banner", "-version"]),
      capture(resolvedPath, ["-hide_banner", "-encoders"]),
      capture(resolvedPath, ["-hide_banner", "-filters"]),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not execute FFmpeg at ${resolvedPath}: ${detail}`, { cause: error });
  }

  validateFfmpegOutputs(
    { versionOutput, encoderOutput, filterOutput },
    `FFmpeg at ${resolvedPath}`,
  );

  return resolvedPath;
}

function normalizeMacArchitectures(architectures) {
  const normalized = Array.isArray(architectures) ? architectures : [architectures];
  if (normalized.length === 0) {
    throw new Error("At least one macOS FFmpeg architecture is required");
  }

  for (const architecture of normalized) {
    if (architecture !== "x64" && architecture !== "arm64") {
      throw new Error(`Unsupported macOS architecture: ${String(architecture)}`);
    }
  }

  return [...new Set(normalized)];
}

export function shouldRunMacRuntimeValidation(architectures, nativeArchitecture = process.arch) {
  return normalizeMacArchitectures(architectures).includes(nativeArchitecture);
}

export async function validateMachOArchitectures(binaryPath, architectures, binaryLabel = "Mach-O binary") {
  if (process.platform !== "darwin") {
    throw new Error("Mach-O architecture validation must run on macOS");
  }

  const resolvedPath = path.resolve(binaryPath);
  const normalizedArchitectures = normalizeMacArchitectures(architectures);
  await access(resolvedPath, fsConstants.R_OK | fsConstants.X_OK);
  await access(lipoPath, fsConstants.X_OK);

  let actualArchitectures;
  try {
    const { stdout } = await execFileAsync(lipoPath, ["-archs", resolvedPath], {
      encoding: "utf8",
    });
    actualArchitectures = stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((architecture) => architecture === "x86_64" ? "x64" : architecture);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not inspect ${binaryLabel} architectures at ${resolvedPath}: ${detail}`, { cause: error });
  }

  const expectedArchitectureSet = new Set(normalizedArchitectures);
  const actualArchitectureSet = new Set(actualArchitectures);
  if (
    expectedArchitectureSet.size !== actualArchitectureSet.size
    || [...expectedArchitectureSet].some((architecture) => !actualArchitectureSet.has(architecture))
  ) {
    throw new Error(
      `${binaryLabel} has architectures ${actualArchitectures.join("+") || "none"}; expected ${normalizedArchitectures.join("+")}: ${resolvedPath}`,
    );
  }

  for (const architecture of normalizedArchitectures) {
    const lipoArchitecture = architecture === "x64" ? "x86_64" : architecture;
    try {
      await execFileAsync(lipoPath, [resolvedPath, "-verify_arch", lipoArchitecture]);
    } catch (error) {
      throw new Error(`${binaryLabel} does not contain the required ${architecture} architecture: ${resolvedPath}`, {
        cause: error,
      });
    }
  }

  return { binaryPath: resolvedPath, architectures: normalizedArchitectures };
}

export async function validateMacFfmpegBinary(binaryPath, architectures) {
  const normalizedArchitectures = normalizeMacArchitectures(architectures);
  const { binaryPath: resolvedPath } = await validateMachOArchitectures(
    binaryPath,
    normalizedArchitectures,
    "FFmpeg",
  );
  await access(stringsPath, fsConstants.X_OK);

  let stringsOutput;
  try {
    ({ stdout: stringsOutput } = await execFileAsync(stringsPath, [resolvedPath], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not inspect FFmpeg strings at ${resolvedPath}: ${detail}`, { cause: error });
  }

  validateFfmpegStaticStrings(stringsOutput, `FFmpeg at ${resolvedPath}`);

  const runtimeValidated = shouldRunMacRuntimeValidation(normalizedArchitectures);
  if (runtimeValidated) {
    await validateFfmpegBinary(resolvedPath);
  }

  return { binaryPath: resolvedPath, runtimeValidated };
}

export function getInstalledFfmpegPath(platform = process.platform) {
  const executableName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(projectDirectory, "node_modules", "ffmpeg-static", executableName);
}

export async function main() {
  const unexpectedArguments = process.argv.slice(2);
  if (unexpectedArguments.length > 0) {
    throw new Error(`verify-ffmpeg.mjs does not accept arguments: ${unexpectedArguments.join(" ")}`);
  }

  const binaryPath = getInstalledFfmpegPath();
  await validateFfmpegBinary(binaryPath);
  process.stdout.write(`Verified release-safe FFmpeg: ${binaryPath}\n`);
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
