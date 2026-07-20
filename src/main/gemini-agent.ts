/**
 * Built-in Gemini editing agent.
 *
 * Runs a function-calling loop against the Gemini API from the main process,
 * exposing the same edit machinery the MCP server offers external CLIs:
 * inspect_project, run_analysis (local Whisper/silence/thumbnails),
 * apply_edit_plan (validated by the shared Zod operation schema, applied via
 * applyAgentEdit with revision checks + .ovc/history checkpoints), and
 * undo_last_edit. The running editor picks up applied edits through the
 * existing editor.json fs.watch → editor:project-state-changed path, so the
 * renderer refreshes and the "Undo AI edit" card works unchanged.
 *
 * The built-in chat automatically includes the primary video track through
 * the Gemini Files API so the model can see and hear the footage it is asked
 * to edit. Sessions reuse the uploaded file instead of uploading per message.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applyAgentEdit,
  hasFreshDirtySession,
  readEditorDocument,
  undoAgentEdit
} from "./editor-document-store";
import {
  getProjectAnalysisJob,
  readCachedAnalysis,
  startProjectAnalysis
} from "./editor-analysis";
import { getEditorDuration } from "../shared/editor-domain";
import type { EditorEditOperation } from "../shared/editor-domain";
import { operationSchema } from "../shared/editor-domain/operation-schema";
import { resolveCatalogProject } from "../mcp/project-catalog";
import type {
  GeminiChatMessage,
  GeminiChatSendRequest,
  GeminiChatUpdateEvent
} from "../shared/types";

const geminiModel = "gemini-3.5-flash";
const geminiBase = "https://generativelanguage.googleapis.com";
const maxToolTurns = 8;
const maxHistoryContents = 40;

const systemInstruction = `You are the AI editing assistant inside Open Video Craft, a screen-recording video editor. You can inspect the user's project, run local analysis (transcript with word timestamps, silence ranges, filler-word candidates), and apply timeline edits.

Rules:
- Apply only what the user asked for; never add unrelated cleanup, zooms, speed-ups, captions, or transitions.
- Always call inspect_project before your first edit in a conversation, and run_analysis before content-aware edits (cuts, filler removal, generated subtitles). Layout, styling, view, audio-level, import, and music requests do not need analysis.
- Times are in seconds on the project timeline. Zoom scale is 1–4, targetX/targetY are 0–100 percent. Speed rates are integers 1–5. Transition types: crossfade, fade-black, slide-left, wipe-left (duration 0.1–2 s). Subtitle styles: clean, karaoke, boxed, pop.
- The complete editor operation types are: remove_ranges, trim_clip, delete_clip, split_clip, move_clip, sequence_clips, set_audio, set_audio_lane, set_master_volume, set_background_audio, set_layout, set_background, set_camera, set_screen, set_text_overlay, remove_text_overlay, set_subtitle_preferences, set_editor_view, import_media, generate_music, set_zoom, remove_zoom, set_speed, remove_speed, set_transition, remove_transition, replace_subtitles, update_subtitle, and set_export_range.
- set_audio and set_audio_lane use gainDb (-60 to 12) plus muted. set_master_volume uses volume 0–100. set_editor_view accepts previewQuality high/low, timelineZoom 1–10, and previewZoom 0.65–1.6.
- set_layout uses layoutMode screen-only/camera-only/bubble/bubble-fill/presenter/side-by-side/side-overlap. set_background uses style real-world-1..6, gradient-1..3, or custom; category is image/gradient and custom also needs customImportId.
- set_camera may set size 8–60, position on the 3x3 top/middle/bottom-left/center/right grid, shape circle/rounded/square, borderStyle none/light/accent, contentTransform {x,y,scale,mirrored}, and frame {x,y,size}. set_screen may set position {x,y,scale}, aspectRatio auto/16:9/16:10/4:3, and cornerStyle flat/soft/round.
- set_text_overlay takes overlay {id,start,end,text,x,y,size,color,weight,animation}; x/y are 0–100, color is #RRGGBB, weight is 400/600/700/800, and animation is none/fade/pop/slide-up. remove_text_overlay takes id. set_subtitle_preferences takes optional language and style.
- import_media accepts paths plus placement media-bin/timeline/background-audio/custom-background and optional timelineStart. generate_music accepts engine lyria-clip/lyria-pro, prompt, and optional lyrics. Use these only when explicitly requested; they are queued for the open editor so local file access and saved provider credentials stay inside the app.
- apply_edit_plan applies one coherent plan; put every operation for the request in a single call when possible. Segment ids and item ids must come from inspect_project.
- If a tool reports a revision conflict, call inspect_project again and retry once with the new revision.
- After editing, tell the user plainly what changed. Keep answers short and concrete.
- Never mention internal revision numbers, edit IDs, or checkpoint details in user-facing replies.`;

interface GeminiFunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiFunctionResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  /** Opaque Gemini 3 reasoning state that must be replayed with the model turn. */
  thoughtSignature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  fileData?: { fileUri: string; mimeType: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface AgentSession {
  history: GeminiContent[];
  messages: GeminiChatMessage[];
  videoFile: { uri: string; mimeType: string; trackPath: string } | null;
  abort: AbortController | null;
  lastEdit: { editId: string; revision: number; summary: string } | null;
  lastMutation: { sequence: number; recoveryText: string } | null;
}

const toolDeclarations = [
  {
    name: "inspect_project",
    description:
      "Read the complete saved project/editor state: timeline ids, media, revision, duration, composition/layout, backgrounds, camera/screen controls, text, subtitles, audio, and view settings.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "run_analysis",
    description:
      "Run (or fetch cached) local analysis: speech transcript with timestamps, silence ranges, filler-word candidates. Takes up to a couple of minutes on first run.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "apply_edit_plan",
    description:
      "Apply one revision-checked editor plan. Supports timeline edits, per-source/lane/master audio, layout/background/camera/screen composition, text overlays, subtitle settings, view quality/zoom, media import, Lyria music generation, effects, transitions, and export range.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "One human-readable sentence describing the edit (shown to the user)."
        },
        baseRevision: {
          type: "number",
          description: "The project revision this plan was built against (from inspect_project)."
        },
        operations: {
          type: "array",
          description: "The typed edit operations.",
          items: { type: "object" }
        }
      },
      required: ["summary", "baseRevision", "operations"]
    }
  },
  {
    name: "undo_last_edit",
    description: "Undo the most recent edit this assistant applied, if it is still the newest revision.",
    parameters: { type: "object", properties: {} }
  }
];

export class GeminiAgentManager {
  private readonly sessions = new Map<string, AgentSession>();

  constructor(
    private readonly input: {
      userDataPath: string;
      getApiKey: () => Promise<string | null>;
      onUpdate: (event: GeminiChatUpdateEvent) => void;
      /** Ask the open editor window to flush unsaved changes to disk. */
      requestEditorFlush: () => void;
    }
  ) {}

  getHistory(projectId: string): GeminiChatMessage[] {
    return this.sessions.get(projectId)?.messages ?? [];
  }

  reset(projectId: string): void {
    this.sessions.get(projectId)?.abort?.abort();
    this.sessions.delete(projectId);
  }

  cancel(projectId: string): boolean {
    const session = this.sessions.get(projectId);
    if (!session?.abort) return false;
    session.abort.abort();
    return true;
  }

  async send(request: GeminiChatSendRequest): Promise<GeminiChatMessage[]> {
    const apiKey = await this.input.getApiKey();
    if (!apiKey) {
      throw new Error("No Gemini API key is saved. Add one in the AI settings.");
    }

    const session = this.getSession(request.projectId);
    if (session.abort) {
      throw new Error("The assistant is still working on the previous message.");
    }

    const control = new AbortController();
    session.abort = control;
    const mutationSequenceAtStart = session.lastMutation?.sequence ?? 0;
    let activeUserContent: GeminiContent | null = null;

    const update = (status: GeminiChatUpdateEvent["status"], message: string | null = null) =>
      this.input.onUpdate({ projectId: request.projectId, status, message });

    try {
      const userParts: GeminiPart[] = [];
      if (request.includeVideo) {
        const video = await this.ensureVideoUploaded(request.projectId, apiKey, control.signal, update);
        if (video && !session.history.some((content) => content.parts.some((part) => part.fileData))) {
          userParts.push({ fileData: { fileUri: video.uri, mimeType: video.mimeType } });
        }
      }
      userParts.push({ text: request.message });

      activeUserContent = { role: "user", parts: userParts };
      session.history.push(activeUserContent);
      trimHistory(session);
      session.messages.push({
        id: randomUUID(),
        role: "user",
        text: request.message,
        createdAt: Date.now(),
        editSummary: null,
        editId: null
      });

      update("thinking");
      const { text, editSummary, editId } = await this.runLoop(
        request.projectId, session, apiKey, control.signal, request.includeVideo, update
      );

      session.messages.push({
        id: randomUUID(),
        role: "assistant",
        text,
        createdAt: Date.now(),
        editSummary,
        editId
      });
      update("done");
      return session.messages;
    } catch (error) {
      recoverHistoryAfterFailure(session, activeUserContent, mutationSequenceAtStart);
      update("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      session.abort = null;
    }
  }

  private getSession(projectId: string): AgentSession {
    let session = this.sessions.get(projectId);
    if (!session) {
      session = {
        history: [],
        messages: [],
        videoFile: null,
        abort: null,
        lastEdit: null,
        lastMutation: null
      };
      this.sessions.set(projectId, session);
    }
    return session;
  }

  private async runLoop(
    projectId: string,
    session: AgentSession,
    apiKey: string,
    signal: AbortSignal,
    includeVideo: boolean,
    update: (status: GeminiChatUpdateEvent["status"], message?: string | null) => void
  ): Promise<{ text: string; editSummary: string | null; editId: string | null }> {
    let editSummary: string | null = null;
    let editId: string | null = null;

    for (let turn = 0; turn < maxToolTurns; turn += 1) {
      const parts = await this.generate(session, apiKey, signal, includeVideo);
      const functionCalls = parts.filter((part) => part.functionCall);
      const text = parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      session.history.push({ role: "model", parts });
      trimHistory(session);

      if (functionCalls.length === 0) {
        return { text: text || "Done.", editSummary, editId };
      }

      const responses: GeminiPart[] = [];
      for (const part of functionCalls) {
        const call = part.functionCall as GeminiFunctionCall;
        const outcome = await this.executeTool(projectId, session, call, update);
        if (outcome.appliedEdit) {
          editSummary = outcome.appliedEdit.summary;
          editId = outcome.appliedEdit.editId;
        }
        responses.push({
          functionResponse: { id: call.id, name: call.name, response: outcome.response }
        });
      }
      session.history.push({ role: "user", parts: responses });
      trimHistory(session);
    }

    return {
      text: "I ran out of tool budget before finishing — please try a more specific request.",
      editSummary,
      editId
    };
  }

  private async generate(
    session: AgentSession,
    apiKey: string,
    signal: AbortSignal,
    includeVideo: boolean
  ): Promise<GeminiPart[]> {
    // Keep both the persisted session and this individual request bounded. The
    // latter is deliberate: older sessions may have been created by a version
    // that trimmed arbitrary content pairs and left a tool response orphaned.
    trimHistory(session);
    const historyWithoutFiles = includeVideo ? session.history : withoutFileData(session.history);
    const contents = getBoundedHistory(historyWithoutFiles);
    const response = await fetch(`${geminiBase}/v1beta/models/${geminiModel}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }]
      })
    });

    if (!response.ok) {
      const detail = await response.text().then((body) => body.slice(0, 300)).catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new Error("Gemini rejected the API key. Check it in the AI settings.");
      }
      if (response.status === 429) {
        throw new Error("Gemini rate limit reached. Wait a moment and try again.");
      }
      throw new Error(`Gemini request failed (HTTP ${response.status}). ${detail}`.trim());
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
      promptFeedback?: { blockReason?: string };
    };
    const parts = body.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error(
        body.promptFeedback?.blockReason
          ? `Gemini blocked the request (${body.promptFeedback.blockReason}).`
          : "Gemini returned an empty response."
      );
    }
    return parts;
  }

  private async executeTool(
    projectId: string,
    session: AgentSession,
    call: { name: string; args?: Record<string, unknown> },
    update: (status: GeminiChatUpdateEvent["status"], message?: string | null) => void
  ): Promise<{
    response: Record<string, unknown>;
    appliedEdit?: { summary: string; editId: string };
  }> {
    try {
      switch (call.name) {
        case "inspect_project": {
          update("inspecting");
          return { response: await this.inspectProject(projectId) };
        }
        case "run_analysis": {
          update("analyzing", "Analyzing the recording locally…");
          return { response: await this.runAnalysis(projectId) };
        }
        case "apply_edit_plan": {
          update("applying-edit", "Applying the edit…");
          const summary = typeof call.args?.summary === "string" ? call.args.summary : "AI edit";
          const baseRevision = Number(call.args?.baseRevision);
          if (!Number.isInteger(baseRevision) || baseRevision < 0) {
            return { response: { error: "baseRevision must come from inspect_project." } };
          }
          const rawOperations = Array.isArray(call.args?.operations) ? call.args.operations : [];
          const operations: EditorEditOperation[] = [];
          for (const raw of rawOperations) {
            const parsed = operationSchema.safeParse(raw);
            if (!parsed.success) {
              return {
                response: {
                  error: `Invalid operation: ${parsed.error.issues[0]?.message ?? "schema mismatch"} at ${JSON.stringify(raw).slice(0, 200)}`
                }
              };
            }
            operations.push(parsed.data as EditorEditOperation);
          }
          if (operations.length === 0) {
            return { response: { error: "operations must contain at least one edit operation." } };
          }

          const record = await resolveCatalogProject(this.input.userDataPath, projectId);
          await this.flushEditorIfDirty(record.rootPath);
          const result = await applyAgentEdit({
            rootPath: record.rootPath,
            baseRevision,
            summary,
            operations
          });
          session.lastEdit = {
            editId: result.editId,
            revision: result.document.revision,
            summary
          };
          recordMutation(session, `The requested edit was applied successfully: ${summary}`);
          return {
            response: {
              revision: result.document.revision,
              editId: result.editId,
              duration: result.edit.duration,
              warnings: result.edit.warnings,
              affectedClipIds: result.edit.affectedClipIds
            },
            appliedEdit: { summary, editId: result.editId }
          };
        }
        case "undo_last_edit": {
          if (!session.lastEdit) {
            return { response: { error: "There is no edit from this conversation to undo." } };
          }
          const undoneSummary = session.lastEdit.summary;
          const record = await resolveCatalogProject(this.input.userDataPath, projectId);
          const document = await undoAgentEdit({
            rootPath: record.rootPath,
            baseRevision: session.lastEdit.revision,
            editId: session.lastEdit.editId
          });
          session.lastEdit = null;
          recordMutation(session, `The previous edit was undone successfully: ${undoneSummary}`);
          return { response: { revision: document.revision, undone: true } };
        }
        default:
          return { response: { error: `Unknown tool "${call.name}".` } };
      }
    } catch (error) {
      return { response: { error: error instanceof Error ? error.message : String(error) } };
    }
  }

  private async inspectProject(projectId: string): Promise<Record<string, unknown>> {
    const record = await resolveCatalogProject(this.input.userDataPath, projectId);
    await this.flushEditorIfDirty(record.rootPath);
    const document = await readEditorDocument(record.rootPath);
    return {
      project: { id: record.project.id, name: record.project.name, status: record.project.status },
      revision: document?.revision ?? 0,
      timelineDuration: document ? getEditorDuration(document.state) : 0,
      editorState: document?.state ?? null,
      timeline: document?.state.timelineSegments ?? [],
      zoomEffects: document?.state.zoomEffects ?? [],
      speedEffects: document?.state.speedEffects ?? [],
      transitions: document?.state.transitions ?? [],
      subtitles: (document?.state.subtitles ?? []).slice(0, 200),
      subtitleStyle: document?.state.subtitleStyle ?? "clean",
      audioLevels: document?.state.audioLevels ?? {},
      backgroundAudioIds: document?.state.backgroundAudioIds ?? [],
      trimRange: document?.state.trimRange ?? null,
      imports: (document?.imports ?? []).map((item) => ({
        id: item.id, name: item.name, kind: item.kind, duration: item.duration
      }))
    };
  }

  private async flushEditorIfDirty(rootPath: string): Promise<void> {
    // The renderer autosaves ~1.5 s after changes. Ask it to flush first so
    // inspection and revision-checked edits both operate on the current state.
    if (!(await hasFreshDirtySession(rootPath))) return;

    this.input.requestEditorFlush();
    const flushDeadline = Date.now() + 5000;
    while (await hasFreshDirtySession(rootPath)) {
      if (Date.now() >= flushDeadline) {
        throw new Error("The project still has unsaved changes. Wait for autosave, then retry.");
      }
      await sleep(300);
    }
  }

  private async runAnalysis(projectId: string): Promise<Record<string, unknown>> {
    const record = await resolveCatalogProject(this.input.userDataPath, projectId);
    const cached = await readCachedAnalysis(record.rootPath);
    if (cached) {
      return summarizeAnalysis(cached);
    }
    const editor = await readEditorDocument(record.rootPath);
    const job = await startProjectAnalysis({
      rootPath: record.rootPath,
      project: record.project,
      editor
    });
    // Poll the in-process job until it settles (analysis is local and bounded).
    const deadline = Date.now() + 10 * 60_000;
    let current = job;
    while (current.status === "queued" || current.status === "analyzing") {
      if (Date.now() > deadline) {
        return { error: "Analysis timed out." };
      }
      await sleep(1500);
      current = getProjectAnalysisJob(job.jobId) ?? current;
    }
    if (current.status === "error" || !current.result) {
      return { error: current.message || "Analysis failed." };
    }
    return summarizeAnalysis(current.result);
  }

  private async ensureVideoUploaded(
    projectId: string,
    apiKey: string,
    signal: AbortSignal,
    update: (status: GeminiChatUpdateEvent["status"], message?: string | null) => void
  ): Promise<{ uri: string; mimeType: string } | null> {
    const session = this.getSession(projectId);
    const record = await resolveCatalogProject(this.input.userDataPath, projectId);
    const track = record.project.tracks.screen ?? record.project.tracks.camera;
    if (!track?.path) {
      return null;
    }
    const absolutePath = path.join(record.rootPath, track.path);
    if (session.videoFile && session.videoFile.trackPath === absolutePath) {
      return session.videoFile;
    }

    update("uploading-video", "Uploading the video to Gemini…");
    const data = await fs.readFile(absolutePath);
    const mimeType = track.mimeType?.split(";")[0] || "video/webm";

    const startResponse = await fetch(`${geminiBase}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(data.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      signal,
      body: JSON.stringify({ file: { display_name: `${record.project.name}.webm` } })
    });
    const uploadUrl = startResponse.headers.get("x-goog-upload-url");
    if (!startResponse.ok || !uploadUrl) {
      throw new Error(`Could not start the video upload (HTTP ${startResponse.status}).`);
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(data.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize"
      },
      signal,
      body: new Uint8Array(data)
    });
    if (!uploadResponse.ok) {
      throw new Error(`Video upload failed (HTTP ${uploadResponse.status}).`);
    }
    const uploaded = (await uploadResponse.json()) as {
      file?: { uri?: string; name?: string; state?: string };
    };
    let fileUri = uploaded.file?.uri ?? null;
    const fileName = uploaded.file?.name ?? null;
    let state = uploaded.file?.state ?? "PROCESSING";

    const deadline = Date.now() + 5 * 60_000;
    while (state === "PROCESSING" && fileName) {
      if (Date.now() > deadline) {
        throw new Error("Gemini took too long to process the uploaded video.");
      }
      await sleep(4000);
      const poll = await fetch(`${geminiBase}/v1beta/${fileName}`, {
        headers: { "x-goog-api-key": apiKey },
        signal
      });
      const info = (await poll.json()) as { uri?: string; state?: string };
      state = info.state ?? "PROCESSING";
      fileUri = info.uri ?? fileUri;
    }
    if (state !== "ACTIVE" || !fileUri) {
      throw new Error("Gemini could not process the uploaded video.");
    }

    session.videoFile = { uri: fileUri, mimeType, trackPath: absolutePath };
    return session.videoFile;
  }
}

function summarizeAnalysis(analysis: {
  fingerprint: string;
  timelineDurationSeconds?: number;
  transcript?: { language: string | null; segments: unknown[] } | null;
  silenceRanges?: Array<{ start: number; end: number; duration: number }>;
  editCandidates?: { fillerWords?: unknown[] };
  warnings?: string[];
}): Record<string, unknown> {
  return {
    fingerprint: analysis.fingerprint,
    timelineDurationSeconds: analysis.timelineDurationSeconds ?? null,
    transcript: analysis.transcript ?? null,
    silenceRanges: (analysis.silenceRanges ?? []).slice(0, 100),
    fillerWordCandidates: (analysis.editCandidates?.fillerWords ?? []).slice(0, 100),
    warnings: analysis.warnings ?? []
  };
}

function trimHistory(session: AgentSession): void {
  session.history = getBoundedHistory(session.history);
}

/**
 * Return a suffix made from whole top-level user turns. A turn begins with a
 * regular user message and includes every model function call, opaque thought
 * signature, matching user function response, and final model answer that
 * follows it. Cutting only at these boundaries prevents Gemini from receiving
 * a functionResponse whose functionCall was discarded.
 */
function getBoundedHistory(history: GeminiContent[]): GeminiContent[] {
  const turns = splitIntoTopLevelUserTurns(history);
  if (turns.length === 0) return [];

  let firstTurn = turns.length - 1;
  let contentCount = turns[firstTurn].length;
  while (
    firstTurn > 0 &&
    contentCount + turns[firstTurn - 1].length <= maxHistoryContents
  ) {
    firstTurn -= 1;
    contentCount += turns[firstTurn].length;
  }

  // A single active turn cannot reach the limit with maxToolTurns=8. Should
  // that invariant ever change, retaining its complete call/response chain is
  // safer than producing a smaller but invalid Gemini request.
  return turns.slice(firstTurn).flat();
}

function splitIntoTopLevelUserTurns(history: GeminiContent[]): GeminiContent[][] {
  const boundaryIndexes: number[] = [];
  for (let index = 0; index < history.length; index += 1) {
    if (!isStandardUserContent(history[index])) continue;

    // In a healthy transcript every later top-level user request follows a
    // final (non-tool-calling) model answer. Requiring that relationship also
    // repairs history left by an older arbitrary-pair trimmer: orphan tool
    // prefixes are skipped until the next trustworthy boundary.
    if (index === 0 || isFinalModelContent(history[index - 1])) {
      boundaryIndexes.push(index);
    }
  }

  return boundaryIndexes.map((start, boundaryIndex) => {
    const end = boundaryIndexes[boundaryIndex + 1] ?? history.length;
    return history.slice(start, end);
  });
}

function isStandardUserContent(content: GeminiContent | undefined): boolean {
  return Boolean(
    content?.role === "user" &&
    !content.parts.some((part) => part.functionResponse)
  );
}

function isFinalModelContent(content: GeminiContent | undefined): boolean {
  return Boolean(
    content?.role === "model" &&
    !content.parts.some((part) => part.functionCall)
  );
}

function recoverHistoryAfterFailure(
  session: AgentSession,
  activeUserContent: GeminiContent | null,
  mutationSequenceAtStart: number
): void {
  if (!activeUserContent) return;
  const turnStart = session.history.indexOf(activeUserContent);
  if (turnStart < 0) return;

  const mutation = session.lastMutation;
  if (!mutation || mutation.sequence === mutationSequenceAtStart) {
    // Nothing irreversible happened, so discard the incomplete request. This
    // avoids consecutive user messages or a dangling tool response on retry.
    session.history.splice(turnStart);
    trimHistory(session);
    return;
  }

  // The edit (or undo) is already on disk and must remain visible to Gemini so
  // retrying cannot silently perform it twice. The call and response are
  // retained, then a short synthetic completion makes the interrupted turn
  // valid for the next normal user request without exposing internal ids.
  if (!isFinalModelContent(session.history.at(-1))) {
    session.history.push({
      role: "model",
      parts: [{ text: mutation.recoveryText }]
    });
  }
  trimHistory(session);
}

function recordMutation(session: AgentSession, recoveryText: string): void {
  session.lastMutation = {
    sequence: (session.lastMutation?.sequence ?? 0) + 1,
    recoveryText
  };
}

function withoutFileData(history: GeminiContent[]): GeminiContent[] {
  return history.flatMap((content) => {
    const parts = content.parts.filter((part) => !part.fileData);
    return parts.length > 0 ? [{ ...content, parts }] : [];
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
