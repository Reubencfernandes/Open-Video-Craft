/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.4",
  title: "Reliable saves, faithful text exports, and macOS polish",
  releasedAt: "July 29, 2026",
  summary:
    "Projects save when you ask, exports match the editor more closely, full timelines render completely, and a closed Mac window is easy to reopen.",
  heroImageUrl,
  changes: [
    "Clicking Save now creates a new project reliably and keeps working after a background autosave.",
    "Single-source exports burn in configured text overlays instead of omitting them.",
    "Bundled Inter fonts, measured wrapping, and centered layout make exported overlay text match the editor preview.",
    "Exports render the complete timeline composition instead of only the selected clip.",
    "On macOS, choose Window → Open Main Window or press Command–0 to recreate a closed launcher window.",
    "Mac App Store builds now discover and embed the matching provisioning profile automatically."
  ]
} as const;
