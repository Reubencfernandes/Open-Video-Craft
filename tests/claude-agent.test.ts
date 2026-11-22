import { describe, expect, it } from "vitest";

import {
  CLAUDE_MCP_TOOL_NAMES,
  buildClaudeAgentArgs,
  buildClaudeAgentPrompt,
  buildClaudeEnvironment,
  buildClaudeMcpConfig,
  extractClaudeAssistantText,
  formatClaudeAgentError,
  OVC_MCP_PROJECT_ID_ENV
} from "../src/main/claude-agent";

describe("Claude Max assistant command construction", () => {
  it("uses non-interactive print mode with no session persistence", () => {
    const args = buildClaudeAgentArgs({
      projectId: "project-1",
      message: "Remove the silent parts"
    });
    expect(args).toContain("-p");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--permission-mode");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
  });

  it("disables built-in tools and restricts MCP servers to the app", () => {
    const args = buildClaudeAgentArgs({
      projectId: "project-1",
      message: "Add zooms"
    });
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--mcp-config");
    expect(args[args.indexOf("--mcp-config") + 1]).toContain("open-video-craft");
    expect(args).toContain("--allowedTools");
    expect(args[args.length - 2]).toBe("--");
    for (const tool of CLAUDE_MCP_TOOL_NAMES) {
      expect(args).toContain(tool);
    }
    expect(args.join(" ")).not.toContain("Bash");
    expect(args.join(" ")).not.toContain("ANTHROPIC_API_KEY");
  });

  it("passes only an OS/login environment allowlist to the CLI", () => {
    const environment = buildClaudeEnvironment({
      HOME: "/Users/owner",
      PATH: "/usr/bin:/bin",
      ANTHROPIC_API_KEY: "must-not-leak",
      GEMINI_API_KEY: "must-not-leak",
      AWS_SECRET_ACCESS_KEY: "must-not-leak"
    });
    expect(environment.HOME).toBe("/Users/owner");
    expect(environment.PATH).toBe("/usr/bin:/bin");
    expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
    expect(environment.GEMINI_API_KEY).toBeUndefined();
    expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("binds the MCP server to one project so tools cannot switch projects", () => {
    const config = JSON.parse(buildClaudeMcpConfig(
      { projectId: "project-1", message: "x" },
      {
        userDataPath: "/tmp/user-data",
        electronExecutable: "/tmp/app",
        serverEntrypoint: "/tmp/server.js"
      }
    )) as { mcpServers: Record<string, { env: Record<string, string> }> };
    expect(config.mcpServers["open-video-craft"]?.env[OVC_MCP_PROJECT_ID_ENV]).toBe("project-1");
  });

  it("binds every request to one project and requires MCP inspection before edits", () => {
    const prompt = buildClaudeAgentPrompt({
      projectId: "project-1",
      message: "Remove silences"
    });
    expect(prompt).toContain("project-1");
    expect(prompt).toContain("Remove silences");
    expect(prompt).toContain("inspect_project");
    expect(prompt).not.toContain("shell");
  });

  it("includes prior turns so follow-up requests keep the conversation thread", () => {
    const prompt = buildClaudeAgentPrompt({
      projectId: "project-1",
      message: "Now make it rounded.",
      history: [
        { role: "user", text: "Add an informative box." },
        { role: "assistant", text: "Added a blue callout titled TOPIC." }
      ]
    });
    expect(prompt).toContain("Add an informative box.");
    expect(prompt).toContain("Added a blue callout titled TOPIC.");
    expect(prompt).toContain("follow-up");
    expect(prompt.indexOf("Add an informative box.")).toBeLessThan(prompt.indexOf("Now make it rounded."));
  });

  it("bounds the injected chat history to the last twelve turns", () => {
    const prompt = buildClaudeAgentPrompt({
      projectId: "project-1",
      message: "Current request",
      history: Array.from({ length: 15 }, (_value, index) => ({
        role: "user" as const,
        text: `old-turn-${index}`
      }))
    });
    expect(prompt).not.toContain("old-turn-2\n");
    expect(prompt).toContain("old-turn-14");
  });

  it("rejects prompts longer than the public request limit", () => {
    const message = "x".repeat(8_001);
    expect(() => buildClaudeAgentArgs({ projectId: "project-1", message })).toThrow("message is too long");
  });

  it("extracts plain assistant output and ignores progress lines", () => {
    const text = extractClaudeAssistantText("Using tool…\nDone: added three zooms.\n");
    expect(text).toBe("Done: added three zooms.");
  });

  it("reports Claude Max usage limits without exposing the command", () => {
    const message = formatClaudeAgentError({
      stdout: "You've hit your 5-hour limit · resets 8:50pm",
      stderr: ""
    });
    expect(message).toContain("usage limit");
    expect(message).toContain("8:50pm");
    expect(message).not.toContain("claude -p");
  });

  it("keeps a clear cause for MCP failures", () => {
    const message = formatClaudeAgentError({ stderr: "MCP server unavailable: connection refused" });
    expect(message).toContain("MCP server");
    expect(message).not.toContain("claude -p");
  });
});
