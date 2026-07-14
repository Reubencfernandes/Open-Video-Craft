import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const require = createRequire(import.meta.url);
const { createDefaultEditorState } = require("../dist-electron/shared/editor-domain.js");
const root = await mkdtemp(path.join(os.tmpdir(), "ovc-mcp-smoke-"));
const userData = path.join(root, "user-data");
const projectRoot = path.join(root, "project");
await mkdir(userData, { recursive: true });
await mkdir(path.join(projectRoot, "media"), { recursive: true });
const now = new Date().toISOString();
const project = {
  schemaVersion: 1, appVersion: "test", id: "mcp-smoke", name: "MCP smoke",
  createdAt: now, updatedAt: now, status: "complete", source: null,
  devices: { microphone: { enabled: false, deviceId: null, label: null }, camera: { enabled: false, deviceId: null, label: null } },
  tracks: {}, durationMs: 10_000, startedAt: null, stoppedAt: null, error: null
};
const state = {
  ...createDefaultEditorState(),
  timelineSegments: [
    { id: "screen:segment-0", itemId: "screen", track: "video", lane: 0, start: 0, end: 5, sourceStart: 0 },
    { id: "screen:segment-1", itemId: "screen", track: "video", lane: 0, start: 5, end: 10, sourceStart: 5 }
  ],
  trimRange: { start: 0, end: 10 }
};
await writeFile(path.join(projectRoot, "project.json"), `${JSON.stringify(project, null, 2)}\n`);
await writeFile(path.join(projectRoot, "editor.json"), `${JSON.stringify({
  schemaVersion: 2, revision: 1, savedAt: now, state, imports: [],
  lastMutation: { source: "editor", at: now, editId: null, summary: null }
}, null, 2)}\n`);
await writeFile(path.join(userData, "projects.json"), `${JSON.stringify({
  schemaVersion: 1,
  projects: [{ id: project.id, name: project.name, rootPath: projectRoot, status: "complete", durationMs: 10_000, updatedAt: now, mediaAvailability: { screen: false, camera: false, audio: false }, available: true }]
}, null, 2)}\n`);

const client = new Client({ name: "ovc-smoke", version: "1.0.0" });
const serverCommand = process.env.OVC_MCP_COMMAND || process.execPath;
const serverEntrypoint = process.env.OVC_MCP_ENTRY || path.resolve("dist-electron/mcp/server.js");
const transport = new StdioClientTransport({
  command: serverCommand,
  args: [serverEntrypoint, "--user-data", userData],
  env: process.env.OVC_MCP_COMMAND
    ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    : process.env
});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  for (const required of ["list_projects", "inspect_project", "start_analysis", "get_analysis", "apply_edit_plan", "undo_agent_edit", "export_project"]) {
    if (!names.includes(required)) throw new Error(`Missing MCP tool: ${required}`);
  }
  const inspect = await client.callTool({ name: "inspect_project", arguments: { projectId: project.id } });
  if (inspect.isError) throw new Error("inspect_project failed");
  if (inspect.structuredContent?.editCapabilities?.zoom !== true || inspect.structuredContent?.exportCapabilities?.speedEffects !== true) {
    throw new Error("inspect_project did not advertise end-to-end zoom and speed support");
  }
  const rejectedScope = await client.callTool({
    name: "apply_edit_plan",
    arguments: {
      projectId: project.id,
      baseRevision: 1,
      userRequest: "Add a zoom only.",
      requestedActions: ["zoom"],
      editingBasis: { mode: "direct", reason: "The user requested one explicit action." },
      summary: "Invalid scope probe",
      operations: [{ type: "set_speed", id: "not-requested", start: 1, end: 2, rate: 2 }]
    }
  });
  if (!rejectedScope.isError) throw new Error("apply_edit_plan accepted an operation outside requestedActions");
  const applied = await client.callTool({
    name: "apply_edit_plan",
    arguments: {
      projectId: project.id,
      baseRevision: 1,
      userRequest: "Add a focused zoom and speed up the demo, then set the export range and transition.",
      requestedActions: ["zoom", "speed", "export_range", "transitions"],
      editingBasis: { mode: "direct", reason: "This smoke test provides explicit effect timings." },
      summary: "Set requested effects, range, and transition",
      operations: [
        { type: "set_zoom", id: "zoom-demo", start: 1, end: 3, speed: "fast", easing: "ease-out", scale: 1.8, targetX: 50, targetY: 50 },
        { type: "set_speed", id: "speed-demo", start: 6, end: 8, rate: 2 },
        { type: "set_export_range", start: 1, end: 9 },
        { type: "set_transition", fromSegmentId: "screen:segment-0", toSegmentId: "screen:segment-1", transition: "crossfade", duration: 0.6 }
      ]
    }
  });
  if (applied.isError) throw new Error(`apply_edit_plan failed: ${JSON.stringify(applied.content)}`);
  const editId = applied.structuredContent?.editId;
  const revision = applied.structuredContent?.revision;
  if (typeof editId !== "string" || revision !== 2) throw new Error("apply_edit_plan returned invalid revision metadata");
  const transitioned = await client.callTool({ name: "inspect_project", arguments: { projectId: project.id } });
  if (transitioned.structuredContent?.transitions?.[0]?.type !== "crossfade") {
    throw new Error("apply_edit_plan did not persist the transition");
  }
  if (transitioned.structuredContent?.zoomEffects?.[0]?.id !== "zoom-demo" || transitioned.structuredContent?.speedEffects?.[0]?.rate !== 2) {
    throw new Error("apply_edit_plan did not persist zoom and speed effects");
  }
  const undone = await client.callTool({
    name: "undo_agent_edit",
    arguments: { projectId: project.id, baseRevision: revision, editId }
  });
  if (undone.isError) throw new Error(`undo_agent_edit failed: ${JSON.stringify(undone.content)}`);
  const analysis = await client.callTool({ name: "start_analysis", arguments: { projectId: project.id } });
  if (analysis.isError || typeof analysis.structuredContent?.jobId !== "string") throw new Error("start_analysis failed");
  let analysisStatus = analysis.structuredContent;
  for (let attempt = 0; attempt < 20 && analysisStatus?.status !== "complete"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const polled = await client.callTool({ name: "get_analysis", arguments: { projectId: project.id, jobId: analysis.structuredContent.jobId } });
    analysisStatus = polled.structuredContent;
  }
  if (analysisStatus?.status !== "complete") throw new Error("analysis job did not complete");
  if (analysisStatus?.result?.schemaVersion !== 2 || !analysisStatus?.result?.editCandidates) {
    throw new Error("analysis did not return timestamped editing context");
  }
  const staleAnalysisPlan = await client.callTool({
    name: "apply_edit_plan",
    arguments: {
      projectId: project.id,
      baseRevision: 3,
      userRequest: "Remove only the analyzed pause.",
      requestedActions: ["remove_content"],
      editingBasis: { mode: "analysis-guided", analysisFingerprint: "stale-analysis" },
      summary: "Stale analysis probe",
      operations: [{ type: "remove_ranges", ranges: [{ start: 1, end: 2 }], ripple: true }]
    }
  });
  if (!staleAnalysisPlan.isError) throw new Error("apply_edit_plan accepted a stale analysis fingerprint");
  process.stdout.write("MCP smoke test passed.\n");
} finally {
  await client.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}
