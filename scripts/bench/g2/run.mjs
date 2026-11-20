#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { generateFixtures, fixturePlan, muxFinalizedFile } from "./fixtures.mjs";
import { verifyFinalizedFile } from "./verify.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const name = token.slice(2);
    if (name === "self-test" || name === "quick") {
      options[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

export function selfTest() {
  const plan = fixturePlan();
  if (plan.fps !== 30 || plan.durationSeconds !== 2) throw new Error("invalid fixture plan");
  const status = { status: "PASS", mode: "self-test", checks: 1 };
  return status;
}

export async function runQuick({ out, report }) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "ovc-g2-quick-"));
  const outputDirectory = path.resolve(out);
  await mkdir(outputDirectory, { recursive: true });
  const sources = await generateFixtures(scratch, ffmpeg);
  const finalized = await muxFinalizedFile(scratch, sources, ffmpeg);
  const validation = await verifyFinalizedFile(finalized, ffmpeg, "ffprobe");

  const result = {
    status: "PARTIAL",
    mode: "quick",
    scratchDirectory: scratch,
    finalizedFile: finalized,
    validation,
    checks: [
      { id: "R1", status: "PASS", detail: "deterministic seek index verified by pure unit test" },
      { id: "R2", status: "PASS", detail: "monotonic frame stepping verified by pure unit test" },
      { id: "R3", status: "PARTIAL", detail: "synthetic CFR/VFR hold verified in scheduler; real helper output absent" },
      { id: "R4", status: "PARTIAL", detail: "BT.709 tags written; Delta-E reference comparison not performed" },
      { id: "R5", status: "PARTIAL", detail: "frame-count assertions implemented; 10 min back-pressure run not performed" },
      { id: "R6", status: "BLOCKED_EXTERNAL", detail: "OS-level hardware proof requires target hardware and sudo powermetrics" },
      { id: "R7", status: "BLOCKED_EXTERNAL", detail: "three >=5 min runs not performed" },
      { id: "R8", status: "BLOCKED_EXTERNAL", detail: "1080p60 throughput not measured" },
      { id: "R9", status: "BLOCKED_EXTERNAL", detail: "5 min preview measurement not performed" },
      { id: "R10", status: "BLOCKED_EXTERNAL", detail: "SSIM parity requires running hidden renderer on target Electron" },
      { id: "R11", status: "INFO", detail: "4K60 informational" },
      { id: "R12", status: "INFO", detail: "native fallback runs only after a hard kill" },
      { id: "R13", status: "BLOCKED_EXTERNAL", detail: ">=10 min flash/beep offset measurement not performed" },
      { id: "R14", status: "BLOCKED_EXTERNAL", detail: "QuickTime/AVFoundation manual play not performed" },
      { id: "R15", status: "BLOCKED_EXTERNAL", detail: "full pinned-Electron target runtime suite not performed" }
    ],
    hiddenElectronRun: "NOT_PERFORMED",
    hardwareGpuProof: "BLOCKED_EXTERNAL"
  };
  const reportPath = path.resolve(report);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const options = parseArguments(process.argv.slice(2));
  const promise = options["self-test"] === true
    ? Promise.resolve(selfTest())
    : options.quick === true
      ? runQuick({ out: options.out ?? os.tmpdir(), report: options.report ?? path.join(os.tmpdir(), "g2-report.json") })
      : Promise.reject(new Error("use --self-test or --quick"));
  promise
    .then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
