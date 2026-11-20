#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "../../..");
const packageDirectory = path.join(projectDirectory, "native/capture-poc");
const binaryPath = path.join(packageDirectory, ".build/release/ovc-capture-poc");

const REQUIRED_EVENTS = new Set([
  "session.start",
  "devices",
  "track.first_pts",
  "stats",
  "track.finalized",
  "session.finalized"
]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const name = token.slice(2);
    if (name === "dry-run") {
      options.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  if (options.dryRun !== true) throw new Error("only --dry-run is supported by this harness");
  if (!options.out) throw new Error("--out is required");
  const duration = Number(options.duration ?? "5");
  if (!Number.isInteger(duration) || duration <= 0) throw new Error("--duration must be a positive integer");
  return { out: path.resolve(options.out), duration };
}

function parseEvents(stdout) {
  return stdout.split("\n").filter((line) => line.trim().length > 0).map((line) => {
    const value = JSON.parse(line);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("protocol line is not an object");
    }
    if (value.v !== 1 || typeof value.event !== "string" || typeof value.seq !== "number") {
      throw new Error("protocol line has an invalid envelope");
    }
    if (typeof value.tHostNs !== "string" || !/^-?\d+$/.test(value.tHostNs)) {
      throw new Error("tHostNs is not a decimal string");
    }
    return value;
  });
}

function validateEvents(events, duration) {
  const names = new Set(events.map((event) => event.event));
  const missing = [...REQUIRED_EVENTS].filter((name) => !names.has(name));
  if (missing.length > 0) throw new Error(`missing protocol events: ${missing.join(", ")}`);
  const stats = events.filter((event) => event.event === "stats");
  const expected = Array.from({ length: duration }, (_, index) => index);
  const actual = stats.map((event) => event.elapsedSeconds);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`stats are not 1 Hz: ${JSON.stringify(actual)}`);
  }
  for (const event of events) {
    for (const [key, value] of Object.entries(event)) {
      if (key.endsWith("HostNs") && typeof value === "string") {
        if (!/^-?\d+$/.test(value)) throw new Error(`${key} is not a decimal string`);
      }
    }
  }
}

export async function buildBinary() {
  await execFileAsync("swift", ["build", "-c", "release", "--package-path", packageDirectory], {
    cwd: projectDirectory,
    maxBuffer: 16 * 1024 * 1024
  });
  return binaryPath;
}

export async function runDryRun({ out, duration, binary = binaryPath }) {
  await mkdir(out, { recursive: true });
  const args = [
    "record", "--display", "all", "--camera", "cam-1,cam-2", "--mic", "mic-1",
    "--system-audio", "sck", "--codec", "h264", "--fps", "30",
    "--duration", String(duration), "--out", out, "--dry-run"
  ];
  const { stdout, stderr } = await execFileAsync(binary, args, {
    cwd: projectDirectory,
    maxBuffer: 32 * 1024 * 1024
  });
  const events = parseEvents(stdout);
  validateEvents(events, duration);
  const manifestText = await readFile(path.join(out, "capture-session.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  if (manifest.manifestVersion !== 1 || manifest.dryRun !== true || manifest.status !== "finalized") {
    throw new Error("manifest is not a finalized dry-run v1 manifest");
  }
  const report = {
    status: "PASS",
    mode: "dry-run",
    durationSeconds: duration,
    eventCount: events.length,
    trackCount: manifest.tracks.length,
    manifestVersion: manifest.manifestVersion,
    liveCaptureAttempted: false,
    hardwareGate: "BLOCKED_EXTERNAL"
  };
  await writeFile(path.join(out, "g1-dry-run-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runDryRun({ ...parseArguments(process.argv.slice(2)), binary: await buildBinary() })
    .then((report) => process.stdout.write(`${JSON.stringify(report)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
