import { describe, expect, it } from "vitest";
import {
  applyClaudeStreamEvent,
  buildClaudeAgentArgs,
  buildClaudeAgentPrompt,
  buildClaudeMcpConfig,
  createClaudeStreamState,
  describeResultError,
  quoteWindowsArg
} from "../src/main/claude-code-agent";

describe("Claude Code agent command line", () => {
  it("gives Claude the editor tools and nothing else", () => {
    const args = buildClaudeAgentArgs({ mcpConfigPath: "C:/data/mcp.json", resumeSessionId: null });

    expect(args).toContain("-p");
    expect(args).toContain("--restricted");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--mcp-config") + 1]).toBe("C:/data/mcp.json");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__open-video-craft");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).not.toContain("bypassPermissions");
    expect(args).not.toContain("--resume");
  });

  it("continues the same Claude conversation on later messages", () => {
    const args = buildClaudeAgentArgs({ mcpConfigPath: "mcp.json", resumeSessionId: "session-1" });
    expect(args.slice(-2)).toEqual(["--resume", "session-1"]);
  });

  it("starts the bundled MCP server with this app's data", () => {
    expect(buildClaudeMcpConfig({
      electronExecutable: "C:/App/Open Video Craft.exe",
      serverEntrypoint: "C:/App/resources/app.asar/dist-electron/mcp/server.js",
      userDataPath: "C:/Users/me/AppData/Roaming/Open Video Craft"
    })).toEqual({
      mcpServers: {
        "open-video-craft": {
          type: "stdio",
          command: "C:/App/Open Video Craft.exe",
          args: [
            "C:/App/resources/app.asar/dist-electron/mcp/server.js",
            "--user-data",
            "C:/Users/me/AppData/Roaming/Open Video Craft"
          ],
          env: { ELECTRON_RUN_AS_NODE: "1" }
        }
      }
    });
  });

  it("quotes arguments for cmd.exe when Claude is installed as a .cmd shim", () => {
    expect(quoteWindowsArg("")).toBe('""');
    expect(quoteWindowsArg("--tools")).toBe("--tools");
    expect(quoteWindowsArg("C:/Program Files/mcp.json")).toBe('"C:/Program Files/mcp.json"');
  });
});

describe("Claude Code agent prompt", () => {
  it("explains the job on the first turn and pins the project", () => {
    const prompt = buildClaudeAgentPrompt({
      projectId: "project-1",
      projectName: "Demo",
      message: "Cut the first 5 seconds",
      firstTurn: true
    });
    expect(prompt).toContain('projectId "project-1"');
    expect(prompt).toContain("inspect_project");
    expect(prompt).toContain("Do exactly what the user asked");
    expect(prompt.endsWith("User request: Cut the first 5 seconds")).toBe(true);
  });

  it("stays short on follow-ups but still names the project", () => {
    const prompt = buildClaudeAgentPrompt({
      projectId: "project-1",
      projectName: "Demo",
      message: "Now add a zoom at 0:12",
      firstTurn: false
    });
    expect(prompt).toContain('projectId "project-1"');
    expect(prompt).not.toContain("How to work");
  });
});

describe("Claude Code stream handling", () => {
  it("reports progress and records the applied edit for the undo chip", () => {
    const state = createClaudeStreamState();
    const statuses = [
      { type: "system", subtype: "init", session_id: "s-1", mcp_servers: [{ name: "open-video-craft", status: "connected" }] },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__open-video-craft__inspect_project", input: {} }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: '{"revision":3}' }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "mcp__open-video-craft__apply_edit_plan", input: { summary: "Cut 0–5s" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: '{"editId":"edit-9","summary":"Cut 0–5s","revision":4}' }] }] } },
      { type: "result", subtype: "success", is_error: false, result: "I removed the first five seconds.", session_id: "s-1" }
    ].map((event) => applyClaudeStreamEvent(state, event));

    expect(statuses.map((status) => status?.status ?? null)).toEqual([
      "thinking", "inspecting", "thinking", "applying-edit", "thinking", null
    ]);
    expect(statuses[3]?.message).toBe("Applying: Cut 0–5s");
    expect(state.sessionId).toBe("s-1");
    expect(state.edits).toEqual([{ editId: "edit-9", summary: "Cut 0–5s" }]);
    expect(state.finalText).toBe("I removed the first five seconds.");
    expect(state.isError).toBe(false);
  });

  it("ignores failed tool calls when recording edits", () => {
    const state = createClaudeStreamState();
    applyClaudeStreamEvent(state, { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__open-video-craft__apply_edit_plan", input: {} }] } });
    applyClaudeStreamEvent(state, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "Editor revision changed" }] } });
    expect(state.edits).toEqual([]);
  });

  it("fails clearly when the editor tools cannot start", () => {
    const state = createClaudeStreamState();
    applyClaudeStreamEvent(state, { type: "system", subtype: "init", mcp_servers: [{ name: "open-video-craft", status: "failed" }] });
    expect(state.isError).toBe(true);
    expect(state.errorMessage).toMatch(/editing tools could not start/);
  });

  it("turns sign-in and limit failures into next steps", () => {
    expect(describeResultError("success", "Invalid API key · Please run /login")).toMatch(/run `claude`, sign in/);
    expect(describeResultError("success", "Claude AI usage limit reached")).toMatch(/usage limit/);
    expect(describeResultError("error_max_turns", null)).toMatch(/ran out of steps/);
  });
});
