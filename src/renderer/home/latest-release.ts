/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.3",
  title: "Text tools, safer projects, and updater polish",
  releasedAt: "July 23, 2026",
  summary:
    "A focused editor update with clearer text controls, safer handling of legacy projects, consistent menus, and a responsive download-to-restart experience.",
  heroImageUrl,
  changes: [
    "Add text directly to the viewport, then customize its font, weight, position, size, color, opacity, and entrance animation from one consistent inspector.",
    "The text-layer index now mirrors the timeline with readable labels and a red dot-and-text state that follows selection from the list, viewport, or timeline.",
    "Text font and opacity choices are preserved in saved projects and carried into FFmpeg export while remaining compatible with older project files.",
    "Legacy, missing, or incompatible project entries can be removed safely from Recents without deleting an unknown folder from disk.",
    "Bubble on filled screen keeps its fill composition when Slight or Rounded video corners are selected.",
    "Music AI, text, and transition menus now use the same floating selector and logo-red field focus treatment as the subtitle model picker.",
    "Update downloads use a responsive green progress card that collapses into a contained animated Restart control when installation is ready."
  ]
} as const;
