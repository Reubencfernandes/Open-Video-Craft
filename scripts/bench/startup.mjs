import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: path.resolve("bench/startup/latest") },
    settle: { type: "string", default: "10" },
    samples: { type: "string", default: "40" }
  }
});
const settleSeconds = Number(values.settle);
const sampleTarget = Number(values.samples);
if (!Number.isFinite(settleSeconds) || settleSeconds < 0 || !Number.isInteger(sampleTarget) || sampleTarget < 1) {
  throw new Error("Usage: node scripts/bench/startup.mjs [--out DIR] [--settle SECONDS] [--samples COUNT]");
}

const project = process.cwd();
const output = path.resolve(values.out);
const electron = process.platform === "darwin"
  ? path.join(project, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
  : path.join(project, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
const entrypoint = path.join(project, "dist-electron/main/main.js");
for (const required of [electron, entrypoint, path.join(project, "dist-renderer/index.html")]) {
  try {
    await stat(required);
  } catch {
    throw new Error(`${required} is missing. Run npm run build before bench:startup.`);
  }
}
await mkdir(output, { recursive: true });
const userData = await mkdtemp(path.join(os.tmpdir(), "ovc-bench-startup-"));
const log = createWriteStream(path.join(output, "startup.log"), { flags: "w" });
const child = spawn(electron, [entrypoint, "--bench", `--user-data-dir=${userData}`], {
  cwd: project,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
let exited = false;
let spawnError = null;
child.on("error", (error) => { spawnError = error; exited = true; });
child.on("exit", () => { exited = true; });
const snapshots = [];
const errors = [];

function consume(line) {
  if (line.startsWith("[bench:snapshot] ")) {
    try {
      snapshots.push(JSON.parse(line.slice("[bench:snapshot] ".length)));
    } catch (error) {
      errors.push(`Invalid snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (line.startsWith("[bench:error] ")) {
    errors.push(line);
  }
}
for (const stream of [child.stdout, child.stderr]) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    log.write(chunk);
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) consume(line.trimEnd());
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stop() {
  if (!exited) {
    child.kill("SIGTERM");
    for (let attempt = 0; attempt < 50 && !exited; attempt += 1) await sleep(100);
    if (!exited) child.kill("SIGKILL");
  }
  log.end();
  await rm(userData, { recursive: true, force: true });
}

try {
  const deadline = Date.now() + 30_000;
  while (snapshots.length === 0 && errors.length === 0 && !exited && Date.now() < deadline) await sleep(50);
  if (spawnError) throw spawnError;
  if (snapshots.length === 0) {
    throw new Error(`No bench snapshot received. errors=${JSON.stringify(errors)} exited=${exited}`);
  }

  await sleep(settleSeconds * 1000);
  const samples = [];
  const sampleDeadline = Date.now() + (sampleTarget * 2 + 10) * 1000;
  while (samples.length < sampleTarget && !exited && Date.now() < sampleDeadline) {
    const snapshot = snapshots.at(-1);
    if (snapshot && snapshot !== samples.at(-1)) samples.push(snapshot);
    if (samples.length < sampleTarget) await sleep(100);
  }
  if (samples.length !== sampleTarget) {
    throw new Error(`Collected ${samples.length}/${sampleTarget} snapshots; exited=${exited}; errors=${JSON.stringify(errors)}`);
  }

  const memory = samples.map((sample) => sample.workingSetMb).sort((a, b) => a - b);
  const middle = Math.floor(memory.length / 2);
  const medianWorkingSetMb = memory.length % 2 ? memory[middle] : (memory[middle - 1] + memory[middle]) / 2;
  const csv = ["captured_at,uptime_s,procs,working_set_mb", ...samples.map((sample) =>
    `${sample.capturedAt},${sample.uptimeSeconds.toFixed(3)},${sample.processCount},${sample.workingSetMb.toFixed(1)}`
  )].join("\n") + "\n";
  await writeFile(path.join(output, "bench-samples.csv"), csv);
  const summary = {
    schemaVersion: 1,
    scenario: "startup-idle",
    launchMode: "unpackaged --bench",
    settleSeconds,
    sampleCount: samples.length,
    medianWorkingSetMb,
    minWorkingSetMb: memory[0],
    maxWorkingSetMb: memory.at(-1),
    mainFirstUptimeSeconds: snapshots[0].uptimeSeconds,
    benchErrors: errors
  };
  await writeFile(path.join(output, "bench-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} finally {
  await stop();
}
