/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.2",
  title: "Timeline editing and release reliability",
  releasedAt: "July 22, 2026",
  summary:
    "A more predictable editing release with timeline-owned subtitle timing, safer Cut behavior, stronger export safeguards, and complete build validation.",
  heroImageUrl,
  changes: [
    "Capture screen, camera, microphone, and system audio as separate project tracks from the floating recorder.",
    "Arrange cuts, transitions, zoom and speed effects, text, subtitles, and lane-aware audio on the multi-track timeline.",
    "Subtitle cues stay in timeline order while a fast red playback beam sweeps into the next cue and the active card is highlighted; cue-card timing remains read-only because the timeline is the timing source of truth.",
    "Native text undo/redo, exact subtitle boundary handoffs, and multi-selection Cut behavior are safer and more predictable.",
    "Generate multilingual subtitles with local Whisper or optional cloud providers, with word-level karaoke highlighting in preview.",
    "Gemini and Claude Code can inspect and edit the validated project surface, with one-click rollback for agent edits.",
    "Export timeline composition to MP4, WebM, or MOV with mixed audio and burned-in or sidecar subtitles; preview-only camera and layout styling remains clearly scoped.",
    "Production bundles and the bundled MCP server now run as required CI release checks on both supported desktop platforms."
  ]
} as const;
