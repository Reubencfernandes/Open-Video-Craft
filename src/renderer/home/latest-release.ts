/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "1.5.0",
  title: "Zoom curve editor, UI polish, speech-to-text fix",
  changes: [
    "Edit the custom zoom curve by dragging its control points directly on the curve, with a live preview and a cubic-bezier readout.",
    "Recolored the zoom, subtitle, and audio tool accents from amber to purple to match the timeline.",
    "Subtitle styles are now a clean 2×2 grid, and the Speed panel drops the redundant Start/End inputs.",
    "Removed the non-functional notifications bell and the decorative project-card menu icon on the home screen.",
    "Fixed speech-to-text failing with “no available backend”: the ONNX runtime is now bundled and loaded locally instead of from a blocked CDN.",
    "The Whisper model download progress no longer jumps up and drops back — it is aggregated across files into one steady percentage."
  ]
} as const;
