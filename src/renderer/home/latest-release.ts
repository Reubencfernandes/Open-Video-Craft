/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "2.1.1",
  title: "Redesigned editor, homepage, and Style backgrounds",
  changes: [
    "Redesigned the editor around a neutral black theme: new top bar with AI, Projects, Save, and Export; a tile-style tool rail; and a media panel with filter pills, search, and duration badges.",
    "Rebuilt the timeline with a white playhead, taller rounded clips, neutral track headers, and a bottom edit strip.",
    "Refreshed the homepage to match the editor, with a white New Project button and neutral accents.",
    "New photographic Style backgrounds — Skyline, Cityscape, and Coast — bundled for offline use.",
    "Fixed Style backgrounds disappearing during transitions: only fade-through-black uses a black backdrop now, so your background stays visible through crossfades, slides, and wipes.",
    "The preview now scales to fit the window in both directions, so a short or narrow window no longer clips the top or bottom of the frame."
  ]
} as const;
