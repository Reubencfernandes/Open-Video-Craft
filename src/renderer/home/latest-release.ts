/** Single source for the homepage changelog dialog and release badge. */
const heroImageUrl: string | null = null;

export const latestRelease = {
  version: "2.3.1",
  title: "A smoother, safer recording and editing experience",
  releasedAt: "July 20, 2026",
  summary:
    "A major editor update focused on precise timeline control, complete AI-assisted editing, cleaner audio workflows, and a more polished interface.",
  // Import the release artwork and assign its URL here when it is ready.
  // The changelog uses a plain dark surface until then—never a fake gradient.
  heroImageUrl,
  changes: [
    "The recorder no longer creates a display-sized green border overlay, preventing transparent-window compositor failures on macOS and Windows.",
    "The recorder has a cleaner black-and-pink interface, smooth state transitions, clearer device controls, and an elapsed recording timer.",
    "Drag across an exact time region and one or more timeline lanes; only clips and timed items inside that rectangle are selected.",
    "Zoom, speed, subtitle, text, and media selections are exclusive, and Delete now removes the selected timeline item even while its button has focus.",
    "Each audio lane now has its own mute control, with the same lane-aware mix used during preview, transcription, and final export.",
    "Gemini and Claude Code can now inspect and edit layouts, backgrounds, camera and screen composition, text, subtitles, audio, view settings, media imports, and Lyria music in addition to timeline effects.",
    "The Gemini assistant is responsive at narrow panel widths, handles long messages safely, and sends edits through the shared validated operation contract.",
    "Music AI now focuses on Lyria 3 Clip and Pro; the previous local-model setup and controls have been removed from the interface.",
    "Preview quality and timeline/preview zoom are saved per project and are available to connected AI editors.",
    "Success notifications use a clean tick without a circular border, and notification surfaces no longer use decorative backgrounds or borders.",
    "Codex has been removed from the AI connection screen; Claude Code remains available through the bundled MCP server."
  ]
} as const;
