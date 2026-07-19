/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "2.3.0",
  title: "Precise timeline selection and complete AI editing",
  changes: [
    "Drag across an exact time region and one or more timeline lanes; only clips and timed items inside that rectangle are selected.",
    "Each audio lane now has its own mute control, with the same lane-aware mix used during preview, transcription, and final export.",
    "Gemini and Claude Code can now inspect and edit layouts, backgrounds, camera and screen composition, text, subtitles, audio, view settings, media imports, and Lyria music in addition to timeline effects.",
    "The Gemini assistant is responsive at narrow panel widths, handles long messages safely, and sends edits through the shared validated operation contract.",
    "Music AI now focuses on Lyria 3 Clip and Pro; the previous local-model setup and controls have been removed from the interface.",
    "Preview quality and timeline/preview zoom are saved per project and are available to connected AI editors.",
    "Success notifications use a clean tick without a circular border, and notification surfaces no longer use decorative backgrounds or borders.",
    "Codex has been removed from the AI connection screen; Claude Code remains available through the bundled MCP server."
  ]
} as const;
