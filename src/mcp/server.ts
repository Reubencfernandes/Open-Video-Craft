#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { applyAgentEdit, readEditorDocument, undoAgentEdit } from "../main/editor-document-store";
import { exportEditorProjectToPath } from "../main/composition-export";
import { slugify } from "../main/project-paths";
import {
  getProjectAnalysisJob,
  readCachedAnalysis,
  readContactSheet,
  startProjectAnalysis
} from "../main/editor-analysis";
import { getEditorDuration } from "../shared/editor-domain";
import type { EditorEditOperation } from "../shared/editor-domain";
import { listCatalogProjects, resolveCatalogProject } from "./project-catalog";

const configuredUserDataPath = readArgument("--user-data") ?? process.env.OVC_USER_DATA;
if (!configuredUserDataPath) throw new Error("Open Video Craft MCP requires --user-data <directory>.");
const userDataPath: string = configuredUserDataPath;

const server = new McpServer(
  { name: "open-video-craft", version: "1.1.0" },
  { instructions: "Inspect the project and run local analysis before making content-aware edits. Apply only the action categories explicitly requested by the user; never add generic cleanup, zoom, speed, captions, audio changes, or transitions unless requested. Pass the current revision and one coherent plan. Preserve everything outside the user's stated intent." }
);

const projectIdSchema = z.string().min(1).max(128).optional().describe("Project ID. Omit to use the open or most recent project.");

server.registerResource("projects", "ovc://projects", {
  title: "Open Video Craft projects", mimeType: "application/json"
}, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await projectListPayload(), null, 2) }] }));

server.registerResource("project-timeline", new ResourceTemplate("ovc://projects/{projectId}/timeline", { list: undefined }), {
  title: "Open Video Craft timeline", mimeType: "application/json"
}, async (uri, variables) => ({ contents: [{
  uri: uri.href, mimeType: "application/json",
  text: JSON.stringify(await inspectPayload(String(variables.projectId)), null, 2)
}] }));

server.registerResource("project-analysis", new ResourceTemplate("ovc://projects/{projectId}/analysis", { list: undefined }), {
  title: "Open Video Craft analysis", mimeType: "application/json"
}, async (uri, variables) => {
  const project = await resolveCatalogProject(userDataPath, String(variables.projectId));
  const analysis = await readCachedAnalysis(project.rootPath);
  return { contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(analysis ?? { status: "not-started" }, null, 2)
  }] };
});

server.registerResource("analysis-contact-sheet", new ResourceTemplate("ovc://projects/{projectId}/analysis/contact-sheet/{page}", { list: undefined }), {
  title: "Open Video Craft analysis contact sheet", mimeType: "image/jpeg"
}, async (uri, variables) => {
  const project = await resolveCatalogProject(userDataPath, String(variables.projectId));
  const page = Number(variables.page);
  if (!Number.isInteger(page) || page < 0) throw new Error("Invalid contact-sheet page.");
  const data = await readContactSheet(project.rootPath, page);
  return { contents: [{ uri: uri.href, mimeType: "image/jpeg", blob: data.toString("base64") }] };
});

server.registerTool("list_projects", {
  title: "List Open Video Craft projects",
  description: "List projects the user has explicitly opened in Open Video Craft.",
  inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false }
}, async () => success(await projectListPayload()));

server.registerTool("inspect_project", {
  title: "Inspect video project",
  description: "Read the saved timeline, media inventory, audio levels, subtitles, revision, and V1 export capabilities.",
  inputSchema: { projectId: projectIdSchema }, annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ projectId }) => success(await inspectPayload(projectId)));

server.registerTool("start_analysis", {
  title: "Analyze video locally",
  description: "Start background local Whisper transcription, silence detection, and contact-sheet generation. Returns immediately with a job ID.",
  inputSchema: { projectId: projectIdSchema, thumbnailIntervalSeconds: z.number().int().min(5).max(120).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ projectId, thumbnailIntervalSeconds }) => {
  try {
    const project = await resolveCatalogProject(userDataPath, projectId);
    const editor = await readEditorDocument(project.rootPath);
    const job = await startProjectAnalysis({ rootPath: project.rootPath, project: project.project, editor, thumbnailIntervalSeconds });
    return success(job as unknown as Record<string, unknown>);
  } catch (error) { return failure(error); }
});

server.registerTool("get_analysis", {
  title: "Get video analysis",
  description: "Poll a background analysis job or return the latest cached analysis for a project.",
  inputSchema: { projectId: projectIdSchema, jobId: z.string().optional() },
  annotations: { readOnlyHint: true, destructiveHint: false }
}, async ({ projectId, jobId }) => {
  try {
    if (jobId) {
      const job = getProjectAnalysisJob(jobId);
      if (!job) throw new Error(`Unknown analysis job "${jobId}".`);
      return success(job as unknown as Record<string, unknown>);
    }
    const project = await resolveCatalogProject(userDataPath, projectId);
    const result = await readCachedAnalysis(project.rootPath);
    return success((result ?? { status: "not-started" }) as unknown as Record<string, unknown>);
  } catch (error) { return failure(error); }
});

const rangeSchema = z.object({ start: z.number().nonnegative(), end: z.number().positive() });
const subtitleSchema = z.object({
  id: z.string().min(1), start: z.number().nonnegative(), end: z.number().positive(), text: z.string(),
  words: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string() })).optional()
});
const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove_ranges"), ranges: z.array(rangeSchema).min(1), ripple: z.literal(true) }),
  z.object({ type: z.literal("split_clip"), segmentId: z.string(), at: z.number().nonnegative() }),
  z.object({ type: z.literal("trim_clip"), segmentId: z.string(), timelineStart: z.number().nonnegative().optional(), timelineEnd: z.number().positive().optional() }),
  z.object({ type: z.literal("delete_clip"), segmentId: z.string(), ripple: z.boolean() }),
  z.object({ type: z.literal("move_clip"), segmentId: z.string(), timelineStart: z.number().nonnegative(), lane: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("sequence_clips"), segmentIds: z.array(z.string()).min(1), start: z.number().nonnegative(), gap: z.number().nonnegative() }),
  z.object({ type: z.literal("set_audio"), itemId: z.string(), gainDb: z.number().min(-60).max(12), muted: z.boolean() }),
  z.object({
    type: z.literal("set_zoom"),
    id: z.string().min(1).max(128),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    speed: z.enum(["slow", "medium", "fast"]),
    easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "custom"]).optional(),
    bezier: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    scale: z.number().min(1).max(4),
    targetX: z.number().min(0).max(100),
    targetY: z.number().min(0).max(100)
  }),
  z.object({ type: z.literal("remove_zoom"), id: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("set_speed"), id: z.string().min(1).max(128),
    start: z.number().nonnegative(), end: z.number().positive(), rate: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
  }),
  z.object({ type: z.literal("remove_speed"), id: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("set_transition"),
    fromSegmentId: z.string().min(1),
    toSegmentId: z.string().min(1),
    transition: z.enum(["crossfade", "fade-black", "slide-left", "wipe-left"]),
    duration: z.number().min(0.1).max(2)
  }),
  z.object({ type: z.literal("remove_transition"), fromSegmentId: z.string().min(1), toSegmentId: z.string().min(1) }),
  z.object({ type: z.literal("replace_subtitles"), language: z.string().nullable(), style: z.enum(["clean", "karaoke", "boxed", "pop"]), segments: z.array(subtitleSchema) }),
  z.object({ type: z.literal("update_subtitle"), id: z.string(), start: z.number().nonnegative().optional(), end: z.number().positive().optional(), text: z.string().optional() }),
  z.object({ type: z.literal("set_export_range"), start: z.number().nonnegative(), end: z.number().positive() })
]);

const editActionValues = [
  "remove_content", "restructure", "audio", "zoom", "speed",
  "transitions", "subtitles", "export_range"
] as const;
type EditAction = typeof editActionValues[number];
const editActionSchema = z.enum(editActionValues);
const editingBasisSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("analysis-guided"),
    analysisFingerprint: z.string().min(8).max(128)
      .describe("Fingerprint returned by get_analysis for the analysis used to choose edit timings.")
  }),
  z.object({
    mode: z.literal("direct"),
    reason: z.string().min(3).max(300)
      .describe("Why analysis is unnecessary, such as explicit timestamps supplied by the user.")
  })
]);

server.registerTool("apply_edit_plan", {
  title: "Apply video edit plan",
  description: "Atomically apply only the edits requested by the user, including cuts, clip sequencing, audio, zoom, speed, transitions, subtitles, and export range. Content-aware plans must reference the cached analysis they used. Creates one undo checkpoint.",
  inputSchema: {
    projectId: projectIdSchema,
    baseRevision: z.number().int().nonnegative(),
    userRequest: z.string().min(1).max(1_000)
      .describe("The user's actual editing instruction. Do not broaden or reinterpret it as permission for unrelated cleanup."),
    requestedActions: z.array(editActionSchema).min(1).max(editActionValues.length)
      .describe("Exact action categories used by this plan; extra categories are rejected."),
    editingBasis: editingBasisSchema,
    summary: z.string().min(1).max(500),
    operations: z.array(operationSchema).min(1).max(200)
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
}, async ({ projectId, baseRevision, userRequest, requestedActions, editingBasis, summary, operations }) => {
  try {
    const project = await resolveCatalogProject(userDataPath, projectId);
    const typedOperations = operations as EditorEditOperation[];
    await validateEditScope({
      rootPath: project.rootPath,
      userRequest,
      requestedActions: requestedActions as EditAction[],
      editingBasis,
      operations: typedOperations
    });
    const result = await applyAgentEdit({
      rootPath: project.rootPath, baseRevision, summary,
      operations: typedOperations
    });
    return success({
      projectId: project.project.id,
      revision: result.document.revision,
      editId: result.editId,
      userRequest,
      appliedActions: requestedActions,
      editingBasis,
      summary,
      previousDuration: result.edit.previousDuration,
      duration: result.edit.duration,
      affectedClipIds: result.edit.affectedClipIds,
      warnings: result.edit.warnings
    });
  } catch (error) { return failure(error); }
});

server.registerTool("undo_agent_edit", {
  title: "Undo AI video edit",
  description: "Restore the checkpoint for the current AI edit. Refuses when a newer revision exists.",
  inputSchema: { projectId: projectIdSchema, baseRevision: z.number().int().nonnegative(), editId: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
}, async ({ projectId, baseRevision, editId }) => {
  try {
    const project = await resolveCatalogProject(userDataPath, projectId);
    const document = await undoAgentEdit({ rootPath: project.rootPath, baseRevision, editId });
    return success({ projectId: project.project.id, revision: document.revision, undoneEditId: editId });
  } catch (error) { return failure(error); }
});

server.registerTool("export_project", {
  title: "Export edited video",
  description: "Render a saved editor revision to the project's exports directory, including cuts, sequence, transitions, zoom, speed, synchronized audio, and clean subtitles.",
  inputSchema: {
    projectId: projectIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    format: z.enum(["mp4", "webm", "mov"]).default("mp4"),
    resolution: z.enum(["source", "720p", "1080p", "1440p"]).default("1080p"),
    subtitleMode: z.enum(["burn-in", "sidecar", "none"]).default("burn-in")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
}, async ({ projectId, expectedRevision, format, resolution, subtitleMode }) => {
  try {
    const record = await resolveCatalogProject(userDataPath, projectId);
    const document = await readEditorDocument(record.rootPath);
    if (!document) throw new Error("The project has no saved editor timeline.");
    if (document.revision !== expectedRevision) throw new Error(`Editor revision changed from ${expectedRevision} to ${document.revision}. Inspect before exporting.`);
    const outputDirectory = path.join(record.rootPath, "exports");
    await fs.mkdir(outputDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(outputDirectory, `${slugify(record.project.name) || "video"}-${stamp}.${format}`);
    const result = await exportEditorProjectToPath({
      rootPath: record.rootPath, project: record.project, document, outputPath,
      format, resolution, subtitleMode
    });
    return success({ projectId: record.project.id, revision: document.revision, ...result });
  } catch (error) { return failure(error); }
});

async function projectListPayload() {
  const projects = await listCatalogProjects(userDataPath);
  return { projects: projects.map(({ project, active }) => ({
    id: project.id, name: project.name, status: project.status, durationMs: project.durationMs,
    updatedAt: project.updatedAt, active
  })) };
}

async function inspectPayload(projectId?: string) {
  const record = await resolveCatalogProject(userDataPath, projectId);
  const document = await readEditorDocument(record.rootPath);
  return {
    project: {
      id: record.project.id, name: record.project.name, status: record.project.status,
      durationMs: record.project.durationMs, active: record.active,
      media: Object.entries(record.project.tracks).map(([id, track]) => ({ id: `${record.project.id}:${id}`, track: id, relativePath: track?.path, mimeType: track?.mimeType }))
    },
    revision: document?.revision ?? 0,
    lastMutation: document?.lastMutation ?? null,
    timelineDuration: document ? getEditorDuration(document.state) : 0,
    timeline: document?.state.timelineSegments ?? [],
    audioLevels: document?.state.audioLevels ?? {},
    zoomEffects: document?.state.zoomEffects ?? [],
    speedEffects: document?.state.speedEffects ?? [],
    transitions: document?.state.transitions ?? [],
    subtitles: document?.state.subtitles ?? [],
    subtitleLanguage: document?.state.subtitleLanguage ?? null,
    imports: document?.imports.map(({ relativePath: _relativePath, ...item }) => item) ?? [],
    editCapabilities: {
      removeContent: true, clipSequencing: true, audio: true, zoom: true,
      speedEffects: true, transitions: true, subtitles: true, exportRange: true
    },
    exportCapabilities: {
      cuts: true, clipSequencing: true, transitions: true, audioMixing: true, cleanSubtitles: true,
      zoom: true, speedEffects: true,
      cameraCompositing: false, layouts: false, styledSubtitles: false
    }
  };
}

async function validateEditScope(input: {
  rootPath: string;
  userRequest: string;
  requestedActions: EditAction[];
  editingBasis: { mode: "analysis-guided"; analysisFingerprint: string } | { mode: "direct"; reason: string };
  operations: EditorEditOperation[];
}): Promise<void> {
  if (!input.userRequest.trim()) throw new Error("The original user request is required.");
  const actualActions = new Set(input.operations.map(operationAction));
  const declaredActions = new Set(input.requestedActions);
  if (declaredActions.size !== input.requestedActions.length) {
    throw new Error("requestedActions must not contain duplicates.");
  }
  const missing = [...actualActions].filter((action) => !declaredActions.has(action));
  const extra = [...declaredActions].filter((action) => !actualActions.has(action));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Edit scope mismatch. Missing categories: ${missing.join(", ") || "none"}; unused categories: ${extra.join(", ") || "none"}.`);
  }
  if (input.editingBasis.mode === "analysis-guided") {
    const analysis = await readCachedAnalysis(input.rootPath);
    if (!analysis || analysis.fingerprint !== input.editingBasis.analysisFingerprint) {
      throw new Error("The referenced analysis is missing or stale. Run start_analysis and use the fingerprint returned by get_analysis.");
    }
  }
}

function operationAction(operation: EditorEditOperation): EditAction {
  switch (operation.type) {
    case "remove_ranges":
    case "trim_clip":
    case "delete_clip":
      return "remove_content";
    case "split_clip":
    case "move_clip":
    case "sequence_clips":
      return "restructure";
    case "set_audio":
      return "audio";
    case "set_zoom":
    case "remove_zoom":
      return "zoom";
    case "set_speed":
    case "remove_speed":
      return "speed";
    case "set_transition":
    case "remove_transition":
      return "transitions";
    case "replace_subtitles":
    case "update_subtitle":
      return "subtitles";
    case "set_export_range":
      return "export_range";
  }
}

function success(value: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
function readArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 && typeof process.argv[index + 1] === "string" ? path.resolve(process.argv[index + 1]) : null;
}

void server.connect(new StdioServerTransport()).catch((error) => {
  process.stderr.write(`Open Video Craft MCP failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
