/**
 * Claude Max assistant driven by the authenticated Claude Code CLI.
 *
 * The tool surface is deliberately narrow: built-in tools are disabled, only
 * the Open Video Craft MCP server is loaded, and only its read/analysis/edit
 * tools are allowed. No Anthropic API key is read or passed anywhere.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { ClaudeChatRequest, ClaudeChatResult } from "../shared/types";

export const CLAUDE_MCP_SERVER_NAME = "open-video-craft";
export const OVC_MCP_PROJECT_ID_ENV = "OVC_MCP_PROJECT_ID";

/** Exact MCP tools exposed by `src/mcp/server.ts`. */
export const CLAUDE_MCP_TOOL_NAMES = [
  "mcp__open-video-craft__list_projects",
  "mcp__open-video-craft__inspect_project",
  "mcp__open-video-craft__get_analysis",
  "mcp__open-video-craft__query_analysis_transcript",
  "mcp__open-video-craft__query_analysis_silences",
  "mcp__open-video-craft__start_analysis",
  "mcp__open-video-craft__apply_edit_plan",
  "mcp__open-video-craft__undo_agent_edit",
  "mcp__open-video-craft__export_project"
] as const;

const CLAUDE_SYSTEM_PROMPT = [
  "You are the Open Video Craft editing assistant.",
  "You control the application only through its MCP tools.",
  "Always call inspect_project before proposing or applying an edit.",
  "Apply only the user's requested actions in one validated edit plan.",
  "Read transcript text only with query_analysis_transcript and silence ranges only with query_analysis_silences; get_analysis is for status and fingerprint. For silence speed-ups, use inspect_project to map the named clip to its timeline window, query only that window, and create set_speed effects with unique ids. For topic callouts, use bounded transcript excerpts to choose timestamps and call apply_edit_plan with set_text_overlay, including a title and box style.",
  "Speed effects apply to video clips only, never to music on an audio lane. Use query_analysis_silences, which reports transcript-derived non-speech gaps; never speed a range that overlaps speech.",
  "For music requests, use generate_music with engine claude-local; it renders locally without a Gemini API key.",
  "For subtitle or transcription requests, call start_analysis, read query_analysis_transcript, and apply replace_subtitles from the local result; never require a cloud API key.",
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

function asErrorRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

/** Returns concise UI copy without leaking the full spawned command. */
export function formatClaudeAgentError(error: unknown): string {
  const record = asErrorRecord(error);
  const details = record
    ? `${String(record["stdout"] ?? "")} ${String(record["stderr"] ?? "")}`
    : String(error);
  const normalized = details.toLowerCase();
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
  return detail.length > 0
    ? `Claude Max could not complete this request: ${detail}`
    : "Claude Max could not complete this request.";
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
    return new Promise<ClaudeChatResult>((resolve, reject) => {
      const child = spawn("claude", args, {
        cwd: this.input.userDataPath,
        env: buildClaudeEnvironment(process.env)
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
      child.on("error", () => finish(new Error(formatClaudeAgentError({ stderr }))));
      child.on("close", (code, signal) => {
        const output = `${stdout} ${stderr}`;
        if (cancelled || signal === "SIGTERM") {
          finish(new Error("Claude Max was stopped."));
          return;
        }
        if (code !== 0) {
          finish(new Error(formatClaudeAgentError({ stdout, stderr })));
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
