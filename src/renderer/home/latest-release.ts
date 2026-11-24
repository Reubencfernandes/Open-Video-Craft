/** Single source for the homepage changelog dialog and release badge. */
import heroImageUrl from "../assets/release-1.0.0-hero.jpg";

export const latestRelease = {
  version: "1.0.7",
  title: "Claude edits your video",
  releasedAt: "November 24, 2026",
  summary:
    "Tell Claude Code what to change in the AI panel and watch it edit your timeline. Trimming, scrubbing, and layout presets now behave the way you expect.",
  heroImageUrl,
  changes: [
    "Pick Claude Code in the AI panel and describe an edit: Claude cuts, zooms, speeds up, or captions the video while you watch, and every edit can be undone.",
    "A recording's audio stays in sync with its picture through split, delete, move, and trim.",
    "Trimming keeps the timeline scale steady, works right at 0:00, and the playhead preview keeps up while you scrub.",
    "Layout presets show what each one really does, and video corners now live in Layout.",
    "Timeline thumbnails stay sharp when zoomed and show each clip's own footage."
  ]
} as const;
