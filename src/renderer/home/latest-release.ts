/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "2.2.0",
  title: "AI studio: assistant chat, music generation, and cloud transcription",
  changes: [
    "New AI assistant (Gemini): chat with your project and let it add zooms, speed-ups, subtitles, transitions, or cut content — every edit shows an undo card, and you can optionally let it watch the actual footage.",
    "New Music AI studio: generate background music locally with ACE-Step (runs on your machine) or in the cloud with Lyria 3 Clip/Pro via your Gemini API key; finished tracks drop straight onto the timeline.",
    "Cloud transcription: choose Whisper (on-device), Cohere Transcribe (14 languages), or Gemini in the Subtitles panel — bring your own API key, stored encrypted on this computer.",
    "Subtitles now transcribe every speech source together, so projects with both camera and screen audio caption both voices with timeline-accurate timing.",
    "Layout presets fixed: “fit screen” now floats the video over your Style background with a proper margin, and “filled screen” is truly edge-to-edge; picking a preset resets manual drags so it always takes effect.",
    "Polished the layout drag/resize chrome: crisp hairline selection border and square corner handles that stay visible while dragging — no more color wash over the video."
  ]
} as const;
