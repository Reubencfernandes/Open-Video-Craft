/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.5",
  title: "Clearer macOS permission guidance",
  releasedAt: "July 29, 2026",
  summary:
    "Camera and microphone setup now uses a neutral continuation step before macOS presents its permission request.",
  heroImageUrl,
  changes: [
    "Camera and microphone permission cards now say Continue before the macOS system prompt appears.",
    "Screen Recording guidance uses neutral enablement wording while still directing users to the required System Settings pane.",
    "All reliability, export, updater, support, and macOS window fixes from version 1.0.4 remain included."
  ]
} as const;
