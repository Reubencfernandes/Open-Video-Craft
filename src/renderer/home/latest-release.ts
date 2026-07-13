/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "1.4.0",
  title: "Drag-drop import, project rename, timeline refresh",
  changes: [
    "Drag and drop video, image, or audio files straight onto the media panel to import them.",
    "Rename projects in place from the editor top bar — for saved projects and brand-new edits.",
    "Recolored the timeline accent from amber to purple across the playhead, timecode pill, clip selection, and effects track.",
    "Restyled the media filter tabs and simplified the Import Media button and timeline clip labels.",
    "Speech-to-text now runs the maintained ONNX build of Whisper base.",
    "“Back to main menu” now reliably returns to the launcher instead of silently doing nothing with unsaved changes.",
    "Editing imported media before the first save no longer opens a folder picker on every autosave.",
    "Removed the non-functional capture-frame and fullscreen preview buttons and the Mixed peak readout."
  ]
} as const;
