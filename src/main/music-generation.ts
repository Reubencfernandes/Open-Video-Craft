/**
 * Local AI music generation with ACE-Step v1-3.5B.
 *
 * The app manages its own Python environment: it locates a system Python
 * 3.10–3.12, creates a venv under userData/acestep/venv, pip-installs the
 * `acestep` package, and then spawns the bundled `acestep_generate.py`
 * wrapper once per generation. The wrapper speaks newline-delimited JSON on
 * stdout (progress / result / error); everything else goes to stderr.
 *
 * A per-generation child process (rather than a resident server) keeps the
 * multi-GB model weights out of memory between generations and gives crash
 * isolation for free; the ~20 s model-load cost is surfaced as a phase.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  MusicGenerateProgressEvent,
  MusicGenerateRequest,
  MusicSetupProgressEvent,
  MusicSetupStatus
} from "../shared/types";

export interface MusicWrapperMessage {
  type: "progress" | "result" | "error";
  phase?: string;
  percent?: number | null;
  message?: string;
  path?: string;
}

/** Incremental NDJSON parser: feeds chunks, returns completed messages. */
export function createNdjsonParser(): {
  push: (chunk: string) => MusicWrapperMessage[];
} {
  let remainder = "";
  return {
    push(chunk: string): MusicWrapperMessage[] {
      remainder += chunk;
      const lines = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";
      const messages: MusicWrapperMessage[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(trimmed) as MusicWrapperMessage;
          if (parsed && ["progress", "result", "error"].includes(parsed.type)) {
            messages.push(parsed);
          }
        } catch {
          // Non-protocol noise on stdout — ignore.
        }
      }
      return messages;
    }
  };
}

export function isSupportedPythonVersion(version: string): boolean {
  const match = version.trim().match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 10 && minor <= 12;
}

export function venvPythonPath(venvDirectory: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.join(venvDirectory, "Scripts", "python.exe")
    : path.join(venvDirectory, "bin", "python");
}

const pythonCandidates = ["python3.12", "python3.11", "python3.10", "python3", "python"];
const defaultCheckpointDir = () =>
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".cache", "ace-step", "checkpoints");

export class MusicGenerationManager {
  private installing = false;
  private activeJob: { jobId: string; child: ChildProcess } | null = null;
  private cachedPython: { path: string; version: string } | null = null;

  constructor(
    private readonly input: {
      userDataPath: string;
      wrapperScriptPath: string;
    }
  ) {}

  private get baseDirectory() {
    return path.join(this.input.userDataPath, "acestep");
  }
  private get venvDirectory() {
    return path.join(this.baseDirectory, "venv");
  }
  private get outputDirectory() {
    return path.join(this.baseDirectory, "output");
  }
  private get venvPython() {
    return venvPythonPath(this.venvDirectory, process.platform);
  }

  async getStatus(): Promise<MusicSetupStatus> {
    const python = await this.findPython();
    const venvReady = await pathExists(this.venvPython);
    const acestepInstalled =
      venvReady &&
      (await runCommand(this.venvPython, ["-c", "import acestep"], 30_000)).code === 0;
    const checkpointsDownloaded = await directoryLargerThan(
      defaultCheckpointDir(),
      2 * 1024 * 1024 * 1024
    );

    return {
      pythonPath: python?.path ?? null,
      pythonVersion: python?.version ?? null,
      venvReady,
      acestepInstalled,
      checkpointsDownloaded,
      installing: this.installing,
      generatingJobId: this.activeJob?.jobId ?? null
    };
  }

  async install(
    onProgress: (event: MusicSetupProgressEvent) => void
  ): Promise<MusicSetupStatus> {
    if (this.installing) {
      throw new Error("An ACE-Step install is already running.");
    }
    const python = await this.findPython();
    if (!python) {
      throw new Error(
        "Python 3.10–3.12 was not found on this Mac. Install it from python.org (or via Homebrew: brew install python@3.12), then try again."
      );
    }

    this.installing = true;
    try {
      await fs.mkdir(this.baseDirectory, { recursive: true });

      if (!(await pathExists(this.venvPython))) {
        onProgress({ phase: "venv", line: `Creating Python environment with ${python.path}…` });
        const venv = await runCommand(
          python.path,
          ["-m", "venv", this.venvDirectory],
          120_000,
          (line) => onProgress({ phase: "venv", line })
        );
        if (venv.code !== 0) {
          throw new Error(`Could not create the Python environment: ${venv.output.slice(-500)}`);
        }
      }

      onProgress({ phase: "pip", line: "Installing acestep (several GB of Python packages)…" });
      const pip = await runCommand(
        this.venvPython,
        ["-m", "pip", "install", "--upgrade", "pip", "acestep"],
        45 * 60_000,
        (line) => onProgress({ phase: "pip", line })
      );
      if (pip.code !== 0) {
        throw new Error(`pip install failed: ${pip.output.slice(-800)}`);
      }

      return this.getStatus();
    } finally {
      this.installing = false;
    }
  }

  async generateAceStep(
    request: MusicGenerateRequest,
    onProgress: (event: MusicGenerateProgressEvent) => void
  ): Promise<{ outputPath: string }> {
    if (this.activeJob) {
      throw new Error("Another music generation is already running.");
    }
    if (!(await pathExists(this.venvPython))) {
      throw new Error("ACE-Step is not installed yet. Run the install step first.");
    }

    await fs.mkdir(this.outputDirectory, { recursive: true });
    const outputPath = path.join(this.outputDirectory, `${request.jobId}.wav`);
    const jobPath = path.join(this.outputDirectory, `${request.jobId}.job.json`);
    await fs.writeFile(
      jobPath,
      JSON.stringify({
        prompt: request.prompt,
        lyrics: request.lyrics,
        durationSeconds: request.durationSeconds,
        inferSteps: request.inferSteps,
        guidanceScale: request.guidanceScale,
        seed: request.seed,
        outputPath,
        checkpointDir: null
      })
    );

    onProgress({
      jobId: request.jobId,
      phase: "starting",
      percent: null,
      message: "Starting ACE-Step…"
    });

    try {
      await this.runWrapper(request.jobId, jobPath, onProgress);
      return { outputPath };
    } finally {
      await fs.rm(jobPath, { force: true }).catch(() => undefined);
    }
  }

  cancel(jobId: string): boolean {
    if (this.activeJob?.jobId !== jobId) {
      return false;
    }
    this.activeJob.child.kill("SIGKILL");
    return true;
  }

  killActiveProcesses(): void {
    this.activeJob?.child.kill("SIGKILL");
    this.activeJob = null;
  }

  private runWrapper(
    jobId: string,
    jobPath: string,
    onProgress: (event: MusicGenerateProgressEvent) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.venvPython, [this.input.wrapperScriptPath, jobPath], {
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: "1" }
      });
      this.activeJob = { jobId, child };

      const parser = createNdjsonParser();
      let stderrTail = "";
      let finished: { ok: boolean; message?: string } | null = null;
      // First run downloads ~7 GB of weights; allow a very generous ceiling.
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2 * 60 * 60_000);

      child.stdout.on("data", (chunk: Buffer) => {
        for (const message of parser.push(chunk.toString())) {
          if (message.type === "progress") {
            onProgress({
              jobId,
              phase: normalizePhase(message.phase),
              percent: typeof message.percent === "number" ? message.percent : null,
              message: message.message ?? ""
            });
          } else if (message.type === "result") {
            finished = { ok: true };
          } else if (message.type === "error") {
            finished = { ok: false, message: message.message ?? "ACE-Step failed." };
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-8000);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        this.activeJob = null;
        reject(new Error(`Could not start Python: ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        this.activeJob = null;
        if (finished?.ok) {
          resolve();
        } else if (finished) {
          reject(new Error(finished.message));
        } else if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Music generation was interrupted (exit ${code ?? "unknown"}). ${stderrTail.slice(-400)}`
            )
          );
        }
      });
    });
  }

  private async findPython(): Promise<{ path: string; version: string } | null> {
    if (this.cachedPython) {
      return this.cachedPython;
    }
    for (const candidate of pythonCandidates) {
      const executable = await resolveExecutable(candidate);
      if (!executable) continue;
      const result = await runCommand(
        executable,
        ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"],
        15_000
      );
      const version = result.output.trim().split(/\r?\n/).at(-1) ?? "";
      if (result.code === 0 && isSupportedPythonVersion(version)) {
        this.cachedPython = { path: executable, version };
        return this.cachedPython;
      }
    }
    return null;
  }
}

function normalizePhase(phase: string | undefined): MusicGenerateProgressEvent["phase"] {
  switch (phase) {
    case "downloading-checkpoints":
    case "loading-model":
    case "generating":
    case "saving":
      return phase;
    default:
      return "generating";
  }
}

async function pathExists(target: string): Promise<boolean> {
  return fs.access(target).then(() => true, () => false);
}

async function directoryLargerThan(directory: string, bytes: number): Promise<boolean> {
  let total = 0;
  const walk = async (current: string): Promise<boolean> => {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (await walk(entryPath)) return true;
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath).catch(() => null);
        total += stats?.size ?? 0;
        if (total > bytes) return true;
      }
    }
    return total > bytes;
  };
  return walk(directory);
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  onLine?: (line: string) => void
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let output = "";
    let lineBuffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(-1);
    }, timeoutMs);
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output: output.slice(-16_000) });
    };
    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (onLine) {
        lineBuffer += text;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) onLine(line.trim());
        }
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (error) => {
      output += error.message;
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });
}

/** PATH resolution incl. the user's login shell (GUI apps get a minimal PATH). */
async function resolveExecutable(command: string): Promise<string | null> {
  const direct = await runCommand(command, ["--version"], 10_000);
  if (direct.code === 0) return command;
  if (process.platform === "win32") {
    const located = await runCommand("where.exe", [command], 10_000);
    return located.code === 0 ? located.output.trim().split(/\r?\n/)[0] || null : null;
  }
  const shell = process.env.SHELL || "/bin/zsh";
  const located = await runCommand(shell, ["-lic", `command -v ${command}`], 10_000);
  const executable = located.output.trim().split(/\r?\n/).at(-1) ?? "";
  return located.code === 0 && path.isAbsolute(executable) ? executable : null;
}
