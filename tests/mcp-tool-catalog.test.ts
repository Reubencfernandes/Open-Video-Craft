import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MCP_TOOL_CATALOG, MCP_TOOL_NAMES } from "../src/shared/mcp-tools";

describe("assistant tool catalogue", () => {
  it("lists every tool the MCP server registers, and nothing else", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src/mcp/server.ts"), "utf8");
    const registered = [...source.matchAll(/server\.registerTool\("([a-z_]+)"/gu)]
      .map((match) => match[1])
      .sort();

    expect([...MCP_TOOL_NAMES].sort()).toEqual(registered);
  });

  it("keeps the order and the exact names the registry uses", () => {
    expect(MCP_TOOL_NAMES).toContain("start_analysis");
    expect(MCP_TOOL_NAMES).toContain("insert_transcript_callouts");
    expect(MCP_TOOL_NAMES).toContain("create_reel");
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
  });

  it("exposes b-roll image generation as a job the assistant can poll", async () => {
    expect(MCP_TOOL_NAMES).toContain("insert_broll_cutaways");
    expect(MCP_TOOL_NAMES).toContain("get_broll_generation");

    const source = await fs.readFile(path.join(process.cwd(), "src/mcp/server.ts"), "utf8");
    const generationTool = source.slice(
      source.indexOf('server.registerTool("insert_broll_cutaways"'),
      source.indexOf('server.registerTool("get_broll_generation"')
    );
    // The generation request must be a job, never a blocking call the chat waits on.
    expect(generationTool).toMatch(/generate: z\.object/u);
    expect(generationTool).toContain("startBrollGeneration");
    expect(source).toContain("getBrollGenerationJob");
    expect(source).toContain("cancelBrollGenerationJob");
  });

  it("gives every tool a chip label and a prefilled prompt", () => {
    for (const tool of MCP_TOOL_CATALOG) {
      expect(tool.title.length).toBeGreaterThan(2);
      expect(tool.prompt.length).toBeGreaterThan(5);
    }
  });
});
