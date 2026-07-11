/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "1.3.0",
  title: "Layout restoration and custom zoom curves",
  changes: [
    "Restored every screen and camera layout preset.",
    "Added Linear, Ease In, Ease Out, Smooth, and custom cubic Bezier zoom curves.",
    "Unified the editor tool rail and media library into one clean surface.",
    "Renamed Text to Subtitles and Overlays to Style, with Layout directly after Media.",
    "Added the official Discord community link and logo.",
    "Refined selects, export styling, typography, and selected-item actions.",
    "Made Save explicit, prevented duplicate writes, and removed the unused Settings control.",
    "Added persistent update availability and download progress to the launcher."
  ]
} as const;
