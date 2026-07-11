/** Single source for the homepage changelog dialog and release badge. */
export const latestRelease = {
  version: "1.2.1",
  title: "Homepage and inspector fixes",
  changes: [
    "Recent projects now show real decoded screen or camera frames.",
    "Video timeline clips now display distinct sampled frames.",
    "Removed the duplicate Project Library section and Voice Changer shortcut.",
    "Added release version, Discord contact, and Changelog footer actions.",
    "Update downloads now use the shared notification card.",
    "The editor inspector now displays only the selected tool's controls.",
    "Audio Bézier curves now react live to each clip's dB gain.",
    "Refined compact animated success and error notifications."
  ]
} as const;
