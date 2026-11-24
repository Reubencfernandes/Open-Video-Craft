/**
 * In-app Claude Code assistant.
 *
 * Runs the user's own `claude` CLI headlessly for each chat message and gives
 * it exactly one capability: the bundled Open Video Craft MCP server (inspect,
 * analyze, apply edit plans, undo, export). Built-in tools are disabled, user
 * settings/hooks are ignored (`--restricted`), and other MCP servers are not
 * loaded, so Claude can edit the video but cannot run commands or touch
 * files. Edits land in the project's editor document, which the open editor
 * already watches, so the timeline updates live and every edit is undoable.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeminiChatMessage, GeminiChatUpdateEvent } from "../shared/types";
import { resolveProviderExecutable } from "./ai-connection";
import { hasFreshDirtySession } from "./editor-document-store";

export const claudeMcpServerName = "open-video-craft";
const toolPrefix = `mcp__${claudeMcpServerName}__`;
const requestTimeoutMs = 15 * 60_000;
const maxTranscriptMessages = 200;

export type ClaudeChatUpdateEvent = GeminiChatUpdateEvent;

/** CLI arguments for one headless turn; the prompt itself goes over stdin. */
export function buildClaudeAgentArgs(input: {
  mcpConfigPath: string;
  resumeSessionId: string | null;
}): string[] {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    // No settings files (so no user hooks), no code-running tools.
    "--restricted",
    // No built-in tools at all: no Read/Write/Edit/Bash/Web.
    "--tools", "",
    // Only the editor's MCP server, never the user's other servers.
    "--strict-mcp-config",
    "--mcp-config", input.mcpConfigPath,
    // Pre-approve the editor tools; anything else is refused without asking.
    "--allowedTools", `mcp__${claudeMcpServerName}`,
    "--permission-mode", "dontAsk",
    ...(input.resumeSessionId ? ["--resume", input.resumeSessionId] : [])
  ];
}

/** MCP config that starts the bundled server with this app's data directory. */
export function buildClaudeMcpConfig(input: {
  electronExecutable: string;
  serverEntrypoint: string;
  userDataPath: string;
}) {
  return {
    mcpServers: {
      [claudeMcpServerName]: {
        type: "stdio",
        command: input.electronExecutable,
        args: [input.serverEntrypoint, "--user-data", input.userDataPath],
        env: { ELECTRON_RUN_AS_NODE: "1" }
      }
    }
  };
}

/**
 * The message Claude receives. The first turn explains the job; every turn
 * names the project so tools never act on a different one.
 */
export function buildClaudeAgentPrompt(input: {
  projectId: string;
  projectName: string;
  message: string;
  firstTurn: boolean;
}): string {
  const context = input.firstTurn
    ? [
        "You are the editing assistant built into Open Video Craft, a screen-recording video editor.",
        "The user is watching the editor while you work: every edit you apply appears on their timeline immediately and can be undone.",
        `The open project is "${input.projectName}" (projectId "${input.projectId}"). Pass this projectId to every tool.`,
        "How to work:",
        "- Call inspect_project first to read the current timeline and revision. Inspect again before each later edit: the user may have changed things by hand.",
        "- For content-aware requests (silences, filler words, \"important moments\"), run start_analysis and poll get_analysis, then edit with the analysis fingerprint.",
        "- Do exactly what the user asked, as one apply_edit_plan when possible. Do not add zooms, speed changes, captions, transitions or other cleanup they did not ask for.",
        "- If the request is ambiguous or would remove a lot of footage, ask one short question instead of editing.",
        "- Only export when the user asks for an export.",
        "- When you finish, reply in one to three short sentences that say what changed and where (timestamps). Do not paste JSON.",
        ""
      ].join("\n")
    : `(Project "${input.projectName}", projectId "${input.projectId}". Re-inspect before editing.)\n`;
  return `${context}User request: ${input.message}`;
}

export type ClaudeStreamState = {
  sessionId: string | null;
  finalText: string | null;
  isError: boolean;
  errorMessage: string | null;
  edits: Array<{ editId: string | null; summary: string }>;
  toolNames: Map<string, string>;
};

export function createClaudeStreamState(): ClaudeStreamState {
  return { sessionId: null, finalText: null, isError: false, errorMessage: null, edits: [], toolNames: new Map() };
}

type StreamContent = {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
};

type StreamEvent = {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: string;
  message?: { content?: StreamContent[] | string };
  mcp_servers?: Array<{ name?: string; status?: string }>;
};

/**
 * Fold one stream-json event into the turn state and return the progress
 * status to show, if any. Pure, so the protocol handling is unit-tested.
 */
export function applyClaudeStreamEvent(
  state: ClaudeStreamState,
  event: StreamEvent
): { status: ClaudeChatUpdateEvent["status"]; message: string | null } | null {
  if (event.session_id) state.sessionId = event.session_id;

  if (event.type === "system" && event.subtype === "init") {
    const server = event.mcp_servers?.find((entry) => entry.name === claudeMcpServerName);
    if (server && server.status !== "connected") {
      state.isError = true;
      state.errorMessage = "The Open Video Craft editing tools could not start for Claude Code.";
    }
    return { status: "thinking", message: null };
  }

  if (event.type === "assistant" && Array.isArray(event.message?.content)) {
    let status: { status: ClaudeChatUpdateEvent["status"]; message: string | null } | null = null;
    for (const block of event.message.content) {
      if (block.type !== "tool_use" || !block.name) continue;
      if (block.id) state.toolNames.set(block.id, block.name);
      status = describeToolUse(block.name, block.input ?? {});
    }
    return status;
  }

  if (event.type === "user" && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block.type !== "tool_result" || !block.tool_use_id || block.is_error) continue;
      const tool = state.toolNames.get(block.tool_use_id)?.replace(toolPrefix, "");
      const payload = parseToolResult(block.content);
      if (tool === "apply_edit_plan" && payload) {
        state.edits.push({
          editId: typeof payload.editId === "string" ? payload.editId : null,
          summary: typeof payload.summary === "string" ? payload.summary : "Applied an edit"
        });
      } else if (tool === "undo_agent_edit" && payload) {
        state.edits.push({ editId: null, summary: "Undid the last AI edit" });
      }
    }
    return { status: "thinking", message: null };
  }

  if (event.type === "result") {
    state.finalText = typeof event.result === "string" ? event.result.trim() : null;
    if (event.is_error || (event.subtype && event.subtype !== "success")) {
      state.isError = true;
      state.errorMessage = describeResultError(event.subtype, state.finalText);
    }
    return null;
  }

  return null;
}

function describeToolUse(
  name: string,
  input: Record<string, unknown>
): { status: ClaudeChatUpdateEvent["status"]; message: string | null } {
  switch (name.replace(toolPrefix, "")) {
    case "list_projects":
    case "inspect_project":
      return { status: "inspecting", message: null };
    case "start_analysis":
    case "get_analysis":
      return { status: "analyzing", message: "Analyzing the recording…" };
    case "apply_edit_plan":
      return {
        status: "applying-edit",
        message: typeof input.summary === "string" ? `Applying: ${input.summary}` : null
      };
    case "undo_agent_edit":
      return { status: "applying-edit", message: "Undoing the last AI edit…" };
    case "export_project":
      return { status: "applying-edit", message: "Exporting the video…" };
    default:
      return { status: "thinking", message: null };
  }
}

function parseToolResult(content: unknown): Record<string, unknown> | null {
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join("")
      : "";
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function describeResultError(subtype: string | undefined, text: string | null): string {
  const detail = text ?? "";
  if (/not logged in|please run \/login|invalid api key|authentication|oauth/i.test(detail)) {
    return "Claude Code is not signed in. Open a terminal, run `claude`, sign in, then try again.";
  }
  if (/usage limit|rate limit|overloaded/i.test(detail)) {
    return "Claude is busy or your usage limit was reached. Wait a moment and try again.";
  }
  if (subtype === "error_max_turns") {
    return "Claude ran out of steps before finishing. Try a more specific request.";
  }
  return detail || "Claude Code could not complete the request.";
}

type ClaudeSession = {
  messages: GeminiChatMessage[];
  claudeSessionId: string | null;
  child: ChildProcess | null;
  cancelled: boolean;
};

export class ClaudeCodeAgentManager {
  private readonly sessions = new Map<string, ClaudeSession>();

  constructor(private readonly input: {
    userDataPath: string;
    electronExecutable: string;
    serverEntrypoint: string;
    resolveProject: (projectId: string) => { rootPath: string; name: string } | null;
    onUpdate: (event: ClaudeChatUpdateEvent) => void;
    /** Ask the open editor window to flush unsaved changes to disk. */
    requestEditorFlush: () => void;
  }) {}

  getHistory(projectId: string): GeminiChatMessage[] {
    return this.sessions.get(projectId)?.messages ?? [];
  }

  reset(projectId: string): void {
    this.cancel(projectId);
    this.sessions.delete(projectId);
  }

  cancel(projectId: string): boolean {
    const session = this.sessions.get(projectId);
    if (!session?.child) return false;
    session.cancelled = true;
    killProcessTree(session.child);
    return true;
  }

  /** Stop every running Claude process, e.g. when the app quits. */
  cancelAll(): void {
    for (const projectId of this.sessions.keys()) this.cancel(projectId);
  }

  async send(request: { projectId: string; message: string }): Promise<GeminiChatMessage[]> {
    const project = this.input.resolveProject(request.projectId);
    if (!project) throw new Error("Open the project in the editor before asking Claude to edit it.");
    const session = this.getSession(request.projectId);
    if (session.child) throw new Error("Claude is still working on the previous message.");

    const update = (status: ClaudeChatUpdateEvent["status"], message: string | null = null) =>
      this.input.onUpdate({ projectId: request.projectId, status, message });

    const userMessage: GeminiChatMessage = {
      id: randomUUID(), role: "user", text: request.message, createdAt: Date.now(),
      editSummary: null, editId: null
    };
    session.messages.push(userMessage);
    trimTranscript(session);
    session.cancelled = false;

    try {
      update("thinking", "Starting Claude Code…");
      const executable = await resolveProviderExecutable("claude");
      if (!executable) {
        throw new Error("Claude Code was not found. Install it from claude.com/claude-code, sign in once in a terminal, then try again.");
      }
      await this.flushEditorIfDirty(project.rootPath);
      const mcpConfigPath = await this.writeMcpConfig();
      const prompt = buildClaudeAgentPrompt({
        projectId: request.projectId,
        projectName: project.name,
        message: request.message,
        firstTurn: session.claudeSessionId === null
      });
      const state = await this.runTurn({
        session,
        executable,
        cwd: project.rootPath,
        args: buildClaudeAgentArgs({ mcpConfigPath, resumeSessionId: session.claudeSessionId }),
        prompt,
        update
      });
      if (state.sessionId) session.claudeSessionId = state.sessionId;
      if (session.cancelled) throw new Error("The request was stopped.");
      if (state.isError) throw new Error(state.errorMessage ?? "Claude Code could not complete the request.");

      const lastEdit = [...state.edits].reverse().find((edit) => edit.editId) ?? null;
      session.messages.push({
        id: randomUUID(),
        role: "assistant",
        text: state.finalText || (state.edits.length > 0 ? "Done." : "I didn't change anything."),
        createdAt: Date.now(),
        editSummary: state.edits.length > 0 ? state.edits.map((edit) => edit.summary).join(" · ") : null,
        editId: lastEdit?.editId ?? null
      });
      trimTranscript(session);
      update("done");
      return session.messages;
    } catch (error) {
      // Keep the transcript honest: drop the user turn Claude never answered.
      session.messages = session.messages.filter((message) => message !== userMessage);
      update("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      session.child = null;
    }
  }

  private runTurn(input: {
    session: ClaudeSession;
    executable: string;
    cwd: string;
    args: string[];
    prompt: string;
    update: (status: ClaudeChatUpdateEvent["status"], message?: string | null) => void;
  }): Promise<ClaudeStreamState> {
    return new Promise((resolve, reject) => {
      const state = createClaudeStreamState();
      const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(input.executable);
      const env = { ...process.env };
      // The app may itself run with this set (MCP mode); Claude must not inherit it.
      delete env.ELECTRON_RUN_AS_NODE;
      const child = useShell
        ? spawn(quoteWindowsArg(input.executable), input.args.map(quoteWindowsArg), {
            cwd: input.cwd, env, windowsHide: true, shell: true
          })
        : spawn(input.executable, input.args, { cwd: input.cwd, env, windowsHide: true });
      input.session.child = child;

      let buffered = "";
      let stderr = "";
      const timer = setTimeout(() => {
        input.session.cancelled = true;
        killProcessTree(child);
      }, requestTimeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        let newline = buffered.indexOf("\n");
        while (newline >= 0) {
          const line = buffered.slice(0, newline).trim();
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf("\n");
          if (!line) continue;
          try {
            const status = applyClaudeStreamEvent(state, JSON.parse(line) as StreamEvent);
            if (status) input.update(status.status, status.message);
          } catch {
            // Ignore non-JSON diagnostics on stdout.
          }
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`Could not start Claude Code: ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (input.session.cancelled) {
          resolve(state);
          return;
        }
        if (state.finalText === null && !state.isError) {
          state.isError = true;
          state.errorMessage = describeResultError(undefined, stderr.trim() || `Claude Code exited with code ${code ?? "unknown"}.`);
        }
        resolve(state);
      });
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(input.prompt, "utf8");
    });
  }

  private async writeMcpConfig(): Promise<string> {
    const directory = path.join(this.input.userDataPath, "claude-agent");
    await fs.mkdir(directory, { recursive: true });
    const configPath = path.join(directory, "mcp.json");
    await fs.writeFile(configPath, JSON.stringify(buildClaudeMcpConfig(this.input), null, 2));
    return configPath;
  }

  private async flushEditorIfDirty(rootPath: string): Promise<void> {
    // Claude reads the saved document; flush the editor's autosave first so
    // it edits what the user currently sees.
    if (!(await hasFreshDirtySession(rootPath))) return;
    this.input.requestEditorFlush();
    const deadline = Date.now() + 5000;
    while (await hasFreshDirtySession(rootPath)) {
      if (Date.now() >= deadline) throw new Error("The project still has unsaved changes. Wait for autosave, then retry.");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  private getSession(projectId: string): ClaudeSession {
    let session = this.sessions.get(projectId);
    if (!session) {
      session = { messages: [], claudeSessionId: null, child: null, cancelled: false };
      this.sessions.set(projectId, session);
    }
    return session;
  }
}

function trimTranscript(session: ClaudeSession) {
  if (session.messages.length > maxTranscriptMessages) {
    session.messages = session.messages.slice(-maxTranscriptMessages);
  }
}

/** Quote one argument for cmd.exe; arguments here are fixed flags and paths. */
export function quoteWindowsArg(value: string): string {
  if (value === "") return '""';
  return /[\s"&|<>^()%!]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function killProcessTree(child: ChildProcess) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    // Also stops the MCP server Claude started.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
