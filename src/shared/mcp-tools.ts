/**
 * The AI assistant's tool surface, in one place.
 *
 * The MCP server registers these tools and the in-app chat shows them as chips,
 * so the catalogue is the single source of truth: a tool that exists in the
 * server but not here would be invisible to the owner, and a chip that does not
 * exist in the server would be a lie. It lives under `src/shared` because both
 * the main process and the renderer compile it, and it stays data-only so the
 * renderer never imports the MCP server.
 */
export interface McpToolEntry {
  /** Exact `registerTool` name in src/mcp/server.ts. */
  readonly name: string;
  /** Short label for a chip. */
  readonly title: string;
  /** Message that prefills the composer; the owner edits it before sending. */
  readonly prompt: string;
}

export const MCP_TOOL_CATALOG: readonly McpToolEntry[] = [
  {
    name: "start_analysis",
    title: "Analyze video",
    prompt: "Analyze this recording locally and transcribe what I say with timestamps."
  },
  {
    name: "query_analysis_transcript",
    title: "Search transcript",
    prompt: "Find in the transcript where I talk about "
  },
  {
    name: "query_analysis_silences",
    title: "Find silences",
    prompt: "Find the silent parts of this video so I can speed them up."
  },
  {
    name: "insert_transcript_callouts",
    title: "Add callouts",
    prompt: "Add informational boxes where I explain the main topic."
  },
  {
    name: "create_reel",
    title: "Create reel",
    prompt: "Create a vertical 9:16 reel from the best moments, with TikTok-style subtitles."
  },
  {
    name: "insert_broll_cutaways",
    title: "Add B-roll images",
    prompt: "Insert these B-roll images where I explain the topic: "
  },
  {
    name: "get_broll_generation",
    title: "B-roll progress",
    prompt: "Check the B-roll images you are generating for this project."
  },
  {
    name: "set_youtube_volume",
    title: "YouTube loudness",
    prompt: "Normalize the audio to YouTube-safe loudness (-14 LUFS)."
  },
  {
    name: "apply_edit_plan",
    title: "Apply an edit",
    prompt: "Apply this edit: "
  },
  {
    name: "export_project",
    title: "Export video",
    prompt: "Export this project at 1080p with burned-in subtitles."
  },
  {
    name: "inspect_project",
    title: "Inspect project",
    prompt: "Inspect the current project and tell me what is on the timeline."
  },
  {
    name: "list_projects",
    title: "List projects",
    prompt: "List my projects."
  },
  {
    name: "get_analysis",
    title: "Analysis status",
    prompt: "Show the status of the current analysis."
  },
  {
    name: "undo_agent_edit",
    title: "Undo AI edit",
    prompt: "Undo the last AI edit."
  }
] as const;

/** Tool names the assistant may call, in catalogue order. */
export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOL_CATALOG.map((tool) => tool.name);
