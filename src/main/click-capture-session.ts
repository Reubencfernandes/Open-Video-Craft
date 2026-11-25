/**
 * Runs the `ovc-click-capture` sidecar for exactly one recording.
 *
 * The sidecar streams JSONL on stdout; this session appends it to the project's
 * `.ovc/clicks.jsonl` so the editor can later turn clicks into zoom effects. A
 * missing binary or an Input Monitoring refusal is reported, never hidden: the
 * recording itself continues without automatic zooms.
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";

export const clickCaptureBinaryName = "ovc-click-capture";

export interface ClickCapturePaths {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly repoRoot: string;
}

/** Packaged builds ship the sidecar in Resources; dev builds use the Swift output. */
export function resolveClickCaptureExecutable(paths: ClickCapturePaths): string {
  return paths.isPackaged
    ? path.join(paths.resourcesPath, "bin", clickCaptureBinaryName)
    : path.join(paths.repoRoot, "native", "capture-poc", ".build", "release", clickCaptureBinaryName);
}

export function buildClickCaptureArgs(displayId: string | null): string[] {
  const args: string[] = [];
  if (displayId !== null && displayId.length > 0) {
    args.push("--display", displayId);
  }
  return args;
}

export interface ClickCaptureSessionOptions {
  readonly executablePath: string;
  readonly outputPath: string;
  readonly displayId: string | null;
  /** Reported to the caller instead of thrown; capture never blocks recording. */
  readonly onUnavailable: (reason: string) => void;
  readonly onStderr: (line: string) => void;
}

export interface ClickCaptureSession {
  stop(): void;
}

export function startClickCaptureSession(
  options: ClickCaptureSessionOptions
): ClickCaptureSession {
  let output: WriteStream | null = null;
  let child: ChildProcessByStdio<null, Readable, Readable>;
  let stopped = false;

  const closeOutput = (): void => {
    if (output !== null) {
      output.end();
      output = null;
    }
  };

  try {
    output = createWriteStream(options.outputPath, { flags: "w" });
  } catch (error) {
    options.onUnavailable(
      error instanceof Error ? error.message : "Click capture could not open its output file."
    );
    return { stop: () => undefined };
  }

  try {
    child = spawn(options.executablePath, buildClickCaptureArgs(options.displayId), {
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    closeOutput();
    options.onUnavailable(
      error instanceof Error ? error.message : "Click capture could not start."
    );
    return { stop: () => undefined };
  }

  const activeChild = child;
  const activeOutput = output;
  activeChild.stdout.pipe(activeOutput, { end: false });
  activeChild.stdout.on("error", () => undefined);
  activeChild.stderr.setEncoding("utf8");
  activeChild.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/u)) {
      if (line.trim().length > 0) options.onStderr(line.trim());
    }
  });
  activeChild.on("error", (error) => {
    if (stopped) return;
    options.onUnavailable(error.message);
    closeOutput();
  });
  activeChild.on("close", () => {
    closeOutput();
  });

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      // SIGTERM lets the sidecar flush its last buffered lines.
      activeChild.kill("SIGTERM");
    }
  };
}
