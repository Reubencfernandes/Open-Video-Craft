/**
 * Claude Max assistant driven by the authenticated Claude Code CLI.
 *
 * The tool surface is deliberately narrow: built-in tools are disabled, only
 * the Open Video Craft MCP server is loaded, and only its read/analysis/edit
 * tools are allowed. No Anthropic API key is read or passed anywhere.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ClaudeChatRequest, ClaudeChatResult } from "../shared/types";
import { MCP_TOOL_NAMES } from "../shared/mcp-tools";

export const CLAUDE_MCP_SERVER_NAME = "open-video-craft";
export const OVC_MCP_PROJECT_ID_ENV = "OVC_MCP_PROJECT_ID";

/** Exact MCP tools exposed by `src/mcp/server.ts`. */
export const CLAUDE_MCP_TOOL_NAMES: readonly string[] = MCP_TOOL_NAMES.map(
  (name) => `mcp__${CLAUDE_MCP_SERVER_NAME}__${name}`
);

const CLAUDE_SYSTEM_PROMPT = [
  "You are the Open Video Craft editing assistant.",
  "You control the application only through its MCP tools.",
  "Always call inspect_project before proposing or applying an edit.",
  "Apply only the user's requested actions in one validated edit plan.",
  "Read transcript text only with query_analysis_transcript and silence ranges only with query_analysis_silences; get_analysis is for status and fingerprint. For silence speed-ups, use inspect_project to map the named clip to its timeline window, query only that window, and create set_speed effects with unique ids. For topic callouts, use bounded transcript excerpts to choose timestamps and call apply_edit_plan with set_text_overlay, including a title and box style.",
  "Speed effects apply to video clips only, never to music on an audio lane. Use query_analysis_silences, which reports transcript-derived non-speech gaps; never speed a range that overlaps speech.",
  "For music requests, use generate_music with engine claude-local; it renders locally without a Gemini API key.",
  "For subtitle or transcription requests, call start_analysis, read query_analysis_transcript, and apply replace_subtitles from the local result; never require a cloud API key.",
  "For YouTube-safe constant loudness across all video clips, call set_youtube_volume; it normalizes the final mix to -14 LUFS and -1 dBTP by default.",
  "For informational boxes, call insert_transcript_callouts instead of inventing timings by hand; it reads the cached transcript and places animated boxed callouts where the topic is explained.",
  "For a short vertical reel of the best moments, call create_reel; it derives a new 9:16 project with the subtitles kept and styled, and never modifies the source project.",
  "For B-roll images, call insert_broll_cutaways: pass imagePaths for pictures the user already has, or pass generate with one description per image. A generated picture takes minutes on this Mac, so the call returns a job id at once; poll get_broll_generation until it reports complete or error instead of waiting, and use cancel only when the user asks to stop it.",
  "For audio fade requests, use set_audio with fadeIn and/or fadeOut in seconds (0–10) on the audio item; this is supported, so never say it cannot be done.",
  "For wind or background noise around speech, use set_audio_cleanup on the relevant audio item with a conservative preset and strength 0–100.",
  "Never add unrelated edits, generic cleanup or extra effects.",
  "Reply briefly with what changed; do not describe tool mechanics."
].join(" ");

/** Only OS/login variables needed by the CLI; API keys from the app are never inherited. */
const ALLOWED_CLAUDE_ENV_KEYS = [
  "HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP",
  "LANG", "LC_ALL", "LC_MESSAGES", "TERM", "COLORTERM", "NO_COLOR",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "CLAUDE_CONFIG_DIR"
] as const;

export interface ClaudeAgentInput {
  readonly userDataPath: string;
  readonly electronExecutable: string;
  readonly serverEntrypoint: string;
}

/** Builds a minimal environment; Claude Max auth stays in the user's own CLI config. */
export function buildClaudeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_CLAUDE_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

const CLAUDE_EXECUTABLE_NAME = "claude";

/**
 * Directories where the Claude Code CLI is installed. A Finder-launched app
 * inherits PATH=/usr/bin:/bin:/usr/sbin:/sbin, which never contains the CLI.
 */
export function claudeSearchDirectories(environment: NodeJS.ProcessEnv): string[] {
  const home = environment.HOME?.trim() || os.homedir();
  const fromPath = (environment.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry.length > 0);
  const fallbacks = [
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    "/opt/homebrew/bin",
    "/usr/local/bin"
  ];
  return [...new Set([...fromPath, ...fallbacks])];
}

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolves the CLI on the app PATH first, then the user install directories. */
export function resolveClaudeExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  isExecutable: (candidate: string) => boolean = isExecutableFile
): string {
  for (const directory of claudeSearchDirectories(environment)) {
    const candidate = path.join(directory, CLAUDE_EXECUTABLE_NAME);
    if (isExecutable(candidate)) return candidate;
  }
  return CLAUDE_EXECUTABLE_NAME;
}

export function buildClaudeMcpConfig(request: ClaudeChatRequest, input: ClaudeAgentInput): string {
  return JSON.stringify({
    mcpServers: {
      [CLAUDE_MCP_SERVER_NAME]: {
        command: input.electronExecutable,
        args: [input.serverEntrypoint, "--user-data", input.userDataPath],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          [OVC_MCP_PROJECT_ID_ENV]: request.projectId
        }
      }
    }
  });
}

export function buildClaudeAgentPrompt(request: ClaudeChatRequest): string {
  const message = request.message.trim();
  if (!request.projectId || request.projectId.length > 128) {
    throw new Error("projectId is invalid");
  }
  if (!message || message.length > 8_000) {
    throw new Error("message is too long");
  }
  const history = (request.history ?? []).slice(-12);
  const conversation = history.length > 0
    ? [
        "Conversation so far, most recent last; treat the request below as a follow-up:",
        ...history.map((turn) => `${turn.role}: ${turn.text}`)
      ].join("\n")
    : null;
  return [
    `Open Video Craft project ID: ${request.projectId}`,
    "Use the Open Video Craft MCP tools to inspect the project and perform the following user request.",
    "Call inspect_project before any mutation and preserve everything outside the request.",
    ...(conversation === null ? [] : [conversation]),
    `User request: ${message}`
  ].join("\n");
}

export function buildClaudeAgentArgs(
  request: ClaudeChatRequest,
  input?: Partial<ClaudeAgentInput>
): string[] {
  const config = buildClaudeMcpConfig(request, {
    userDataPath: input?.userDataPath ?? path.join(process.cwd(), ".ovc-claude-user-data"),
    electronExecutable: input?.electronExecutable ?? process.execPath,
    serverEntrypoint: input?.serverEntrypoint ?? path.join(process.cwd(), "dist-electron/mcp/server.js")
  });
  return [
    "-p",
    "--no-session-persistence",
    "--output-format", "text",
    "--permission-mode", "dontAsk",
    "--tools", "",
    "--strict-mcp-config",
    "--mcp-config", config,
    "--append-system-prompt", CLAUDE_SYSTEM_PROMPT,
    "--allowedTools", ...CLAUDE_MCP_TOOL_NAMES,
    "--",
    buildClaudeAgentPrompt(request)
  ];
}

/** Removes CLI progress chatter while preserving the assistant's answer. */
export function extractClaudeAssistantText(stdout: string): string {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(Using tool|Tool call|I(?:'ll| will) (?:use|call)|Let me)\b/i.test(line))
    .join("\n")
    .trim();
}

/** Reads a property that TypeScript does not declare, without casting. */
function readProperty(source: object, key: string): unknown {
  return Reflect.get(source, key);
}

function asErrorRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

/**
 * Collects the readable cause of a failure. `Error.message` and `Error.code`
 * are not enumerable, so a plain object copy would drop them and leave the
 * user with an empty, unexplained message.
 */
function failureDetails(value: unknown): { details: string; code: string | number | null } {
  const record: Record<string, unknown> = value instanceof Error
    ? {
        message: value.message,
        code: readProperty(value, "code"),
        stdout: readProperty(value, "stdout"),
        stderr: readProperty(value, "stderr")
      }
    : asErrorRecord(value) ?? {};
  const readable = [record["message"], record["stdout"], record["stderr"]]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const code = record["code"];
  return {
    details: readable.join(" "),
    code: typeof code === "string" || typeof code === "number" ? code : null
  };
}

/** Returns concise UI copy without leaking the full spawned command. */
export function formatClaudeAgentError(error: unknown): string {
  const { details, code } = failureDetails(error);
  const normalized = details.toLowerCase();
  if (code === "ENOENT" || /enoent/.test(normalized)) {
    return "Claude Code CLI was not found on this Mac. Install or sign in to Claude Code, then reopen Open Video Craft.";
  }
  if (/5-hour limit|usage limit|rate limit|weekly limit/.test(normalized)) {
    const reset = details.match(/resets\s+([^\n"}]+)/iu)?.[1]?.trim();
    return reset
      ? `Claude Max has reached its current usage limit. It resets ${reset}.`
      : "Claude Max has reached its current usage limit. Wait for the reset shown by Claude, then try again.";
  }
  if (/not logged in|authentication|sign in/.test(normalized)) {
    return "Claude Code is not signed in. Sign in with your Claude Max account, then try again.";
  }
  if (/mcp|tool/.test(normalized)) {
    return "Claude could not reach the Open Video Craft MCP server. Reopen the app and try again.";
  }
  const detail = details
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
  if (detail.length > 0) {
    return `Claude Max could not complete this request: ${detail}`;
  }
  if (typeof code === "number") {
    return `Claude Max could not complete this request: the Claude CLI exited with code ${code} and no output.`;
  }
  return "Claude Max could not complete this request.";
}

interface ActiveClaudeRun {
  readonly child: ChildProcessWithoutNullStreams;
  readonly cancel: () => void;
}

export class ClaudeAgentManager {
  private readonly activeRuns = new Map<string, ActiveClaudeRun>();

  constructor(private readonly input: ClaudeAgentInput) {}

  async send(request: ClaudeChatRequest): Promise<ClaudeChatResult> {
    const args = buildClaudeAgentArgs(request, this.input);
    const executable = resolveClaudeExecutable(process.env);
    const environment = buildClaudeEnvironment(process.env);
    // Keep the allowlist, but let the CLI find its own helpers from directories
    // a Finder-launched app never inherits.
    environment.PATH = claudeSearchDirectories(process.env).join(path.delimiter);
    return new Promise<ClaudeChatResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: this.input.userDataPath,
        env: environment
      });
      const cancel = (): void => {
        cancelled = true;
        child.kill("SIGTERM");
      };
      this.activeRuns.set(request.projectId, { child, cancel });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let cancelled = false;
      const timeout = setTimeout(() => child.kill("SIGTERM"), 5 * 60 * 1_000);

      const finish = (error?: Error, text?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.activeRuns.get(request.projectId)?.child === child) {
          this.activeRuns.delete(request.projectId);
        }
        if (error) reject(error);
        else if (text !== undefined) resolve({ text, provider: "claude-max" });
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 8 * 1024 * 1024) child.kill("SIGTERM");
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 8 * 1024 * 1024) child.kill("SIGTERM");
      });
      child.on("error", (error) => finish(new Error(formatClaudeAgentError(error))));
      child.on("close", (code, signal) => {
        const output = `${stdout} ${stderr}`;
        if (cancelled || signal === "SIGTERM") {
          finish(new Error("Claude Max was stopped."));
          return;
        }
        if (code !== 0) {
          finish(new Error(formatClaudeAgentError({ stdout, stderr, code })));
          return;
        }
        if (/5-hour limit|usage limit|rate limit|weekly limit/i.test(output)) {
          finish(new Error(formatClaudeAgentError({ stdout, stderr })));
          return;
        }
        const text = extractClaudeAssistantText(stdout);
        if (text.length === 0) {
          finish(new Error("Claude Max returned an empty response."));
          return;
        }
        finish(undefined, text);
      });

    });
  }

  cancel(projectId: string): boolean {
    const run = this.activeRuns.get(projectId);
    if (run === undefined) return false;
    run.cancel();
    this.activeRuns.delete(projectId);
    return true;
  }
}
