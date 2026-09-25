/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.6",
  title: "Timeline edits that stay in sync",
  releasedAt: "September 25, 2026",
  summary:
    "Cutting, deleting, and moving parts of a recording now keeps its voice in sync with the picture, and clicking a clip selects it without moving the playhead.",
  heroImageUrl,
  changes: [
    "A recording's microphone and system audio now follow its video through split, delete, move, trim, and cut and paste. Hold Alt to edit the video on its own.",
    "Clicking a clip selects it without jumping the playhead, and Ctrl/Cmd+B splits straight after a click.",
    "Dragging the time ruler scrubs the playhead, and trimming the last clip no longer rescales the timeline under the cursor.",
    "Audio tracks sit directly under the video, selected clips show a clear outline, and cuts play back without gaps.",
    "All permission, export, and reliability fixes from version 1.0.5 remain included."
  ]
} as const;
