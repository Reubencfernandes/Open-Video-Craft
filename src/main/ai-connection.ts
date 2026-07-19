/** Detect and configure Claude Code / Codex with the bundled stdio MCP server. */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AiConnectionProviderStatus,
  AiConnectionStatus,
  AiProvider
} from "../shared/types";
import { writeJsonFileAtomic } from "./project-file";

const serverName = "open-video-craft";

export class AiConnectionManager {
  constructor(private readonly input: {
    userDataPath: string;
    electronExecutable: string;
    serverEntrypoint: string;
  }) {}

  async getStatus(): Promise<AiConnectionStatus> {
    const [privacyAccepted, claude] = await Promise.all([
      this.getPrivacyAccepted(), this.getProviderStatus("claude")
    ]);
    return { privacyAccepted, providers: [claude] };
  }

  async configure(provider: AiProvider, privacyAccepted: boolean): Promise<AiConnectionStatus> {
    if (!privacyAccepted) throw new Error("Accept the AI context-sharing notice before connecting a provider.");
    await this.setPrivacyAccepted(true);
    const status = await this.getProviderStatus(provider);
    if (!status.installed) throw new Error(`${provider === "codex" ? "Codex" : "Claude Code"} is not installed or is not available on PATH.`);
    if (!status.supported) throw new Error(status.message ?? `Update ${provider} before connecting Open Video Craft.`);
    if (!status.configured) {
      const executable = await resolveProviderExecutable(provider);
      if (!executable) throw new Error(`${provider} is not installed.`);
      const { command, args, env } = this.getSetupInvocation(provider, executable);
      const result = await run(command, args, env);
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || `Could not configure ${provider}.`);
    }
    return this.getStatus();
  }

  async disconnect(provider: AiProvider): Promise<AiConnectionStatus> {
    const args = provider === "codex"
      ? ["mcp", "remove", serverName]
      : ["mcp", "remove", "--scope", "user", serverName];
    const executable = await resolveProviderExecutable(provider);
    if (!executable) return this.getStatus();
    const result = await run(executable, args);
    if (result.code !== 0 && !/not found|does not exist|unknown/i.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error(result.stderr || result.stdout || `Could not disconnect ${provider}.`);
    }
    return this.getStatus();
  }

  private async getProviderStatus(provider: AiProvider): Promise<AiConnectionProviderStatus> {
    const executable = await resolveProviderExecutable(provider);
    const version = executable ? await run(executable, ["--version"]) : { code: -1, stdout: "", stderr: "" };
    const installed = version.code === 0;
    const capability = installed && executable ? await run(executable, ["mcp", "add", "--help"]) : null;
    const supported = capability?.code === 0 && /add an mcp server|<server-name>|<name>/i.test(`${capability.stdout}\n${capability.stderr}`);
    const configuredResult = supported && executable ? await run(executable, ["mcp", "get", serverName]) : null;
    return {
      provider,
      installed,
      supported,
      configured: configuredResult?.code === 0,
      version: installed ? (version.stdout || version.stderr).trim().split(/\r?\n/)[0] || null : null,
      setupCommand: this.getSetupCommand(provider),
      message: !installed
        ? `${provider === "codex" ? "Codex" : "Claude Code"} was not found on PATH.`
        : !supported
          ? `This ${provider === "codex" ? "Codex" : "Claude Code"} version cannot add MCP clients. Update it first.`
          : null
    };
  }

  private getSetupInvocation(provider: AiProvider, providerExecutable: string = provider): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
    const serverArgs = [this.input.electronExecutable, this.input.serverEntrypoint, "--user-data", this.input.userDataPath];
    if (provider === "codex") {
      return {
        command: providerExecutable,
        args: ["mcp", "add", serverName, "--env", "ELECTRON_RUN_AS_NODE=1", "--", ...serverArgs]
      };
    }
    return {
      command: providerExecutable,
      args: ["mcp", "add", "--scope", "user", "--transport", "stdio", serverName, "--env", "ELECTRON_RUN_AS_NODE=1", "--", ...serverArgs]
    };
  }

  private getSetupCommand(provider: AiProvider): string {
    const invocation = this.getSetupInvocation(provider);
    return [invocation.command, ...invocation.args].map(shellQuote).join(" ");
  }

  private async getPrivacyAccepted(): Promise<boolean> {
    try {
      const value = JSON.parse(await fs.readFile(this.settingsPath(), "utf8")) as { privacyAccepted?: unknown };
      return value.privacyAccepted === true;
    } catch { return false; }
  }

  private setPrivacyAccepted(value: boolean) {
    return writeJsonFileAtomic(this.settingsPath(), { schemaVersion: 1, privacyAccepted: value, updatedAt: new Date().toISOString() });
  }

  private settingsPath() { return path.join(this.input.userDataPath, "ai-connection.json"); }
}

function run(command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, env: { ...process.env, ...extraEnv } });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { child.kill(); finish(-1); }, 15_000);
    const finish = (code: number) => {
      if (settled) return; settled = true; clearTimeout(timer); resolve({ code, stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) });
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => { stderr = error.message; finish(-1); });
    child.on("close", (code) => finish(code ?? -1));
  });
}
function shellQuote(value: string) { return /^[a-zA-Z0-9_./:=+-]+$/.test(value) ? value : `"${value.replace(/["\\$`]/g, "\\$&")}"`; }

async function resolveProviderExecutable(provider: AiProvider): Promise<string | null> {
  const direct = await run(provider, ["--version"]);
  if (direct.code === 0) return provider;
  if (process.platform === "win32") {
    const located = await run("where.exe", [provider]);
    return located.code === 0 ? located.stdout.trim().split(/\r?\n/)[0] || null : null;
  }
  const shell = process.env.SHELL || "/bin/zsh";
  const located = await run(shell, ["-lic", `command -v ${provider}`]);
  const executable = located.stdout.trim().split(/\r?\n/).at(-1) ?? "";
  return located.code === 0 && path.isAbsolute(executable) ? executable : null;
}
