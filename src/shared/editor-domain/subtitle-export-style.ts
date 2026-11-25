/**
 * Burned-in subtitle styling (S3).
 *
 * The saved subtitle style never reached the exported file, so a project styled
 * like a TikTok clip exported plain captions. `subtitleForceStyle` maps the four
 * editor presets to an ASS style override that ffmpeg's subtitles filter accepts,
 * so what the owner picks is what the file shows.
 */
import type { SubtitleStyle } from "./types";

/** Base size in ASS points for a 1080x1920 vertical frame. */
const verticalBase = 64;
const horizontalBase = 44;

function base(vertical: boolean): string {
  return vertical ? `${verticalBase}` : `${horizontalBase}`;
}

/**
 * ASS style override for one preset. Vertical frames get larger, higher type
 * because a reel is watched on a phone.
 */
export function subtitleForceStyle(style: SubtitleStyle, vertical = false): string {
  const size = base(vertical);
  const alignment = vertical ? "2" : "2";
  const margin = vertical ? 220 : 60;

  switch (style) {
    case "karaoke":
      // Word-level punch reads as bright primary text with a heavy outline.
      return [
        "Fontname=Arial",
        "Bold=1",
        `Fontsize=${size}`,
        "PrimaryColour=&H0000E5FF",
        "OutlineColour=&H00000000",
        "BorderStyle=1",
        "Outline=4",
        "Shadow=0",
        `Alignment=${alignment}`,
        `MarginV=${margin}`
      ].join(",");
    case "pop":
      return [
        "Fontname=Arial",
        "Bold=1",
        `Fontsize=${Math.round(Number(size) * 1.08)}`,
        "PrimaryColour=&H00FFFFFF",
        "OutlineColour=&H00140AF9",
        "BorderStyle=1",
        "Outline=5",
        "Shadow=1",
        "Alignment=5",
        "MarginV=0"
      ].join(",");
    case "boxed":
      return [
        "Fontname=Arial",
        "Bold=1",
        `Fontsize=${size}`,
        "PrimaryColour=&H00FFFFFF",
        "OutlineColour=&H00000000",
        "BackColour=&H64000000",
        "BorderStyle=3",
        "Outline=1",
        "Shadow=0",
        `Alignment=${alignment}`,
        `MarginV=${margin}`
      ].join(",");
    case "clean":
    default:
      return [
        "Fontname=Arial",
        "Bold=0",
        `Fontsize=${size}`,
        "PrimaryColour=&H00FFFFFF",
        "OutlineColour=&H80000000",
        "BorderStyle=1",
        "Outline=2",
        "Shadow=0",
        `Alignment=${alignment}`,
        `MarginV=${margin}`
      ].join(",");
  }
}

/** True for the 1080x1920 reel frame. */
export function isVerticalResolution(width: number, height: number): boolean {
  return height > width;
}
