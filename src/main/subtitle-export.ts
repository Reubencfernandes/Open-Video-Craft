/**
 * Writes a `.srt` subtitle sidecar next to an exported video. Cue text is
 * sanitized so it can't corrupt the SRT block structure, and cues are clipped
 * to the exported trim range. Pure aside from the final file write.
 */
import { promises as fs } from "node:fs";
import type { ExportVideoRequest } from "../shared/types";

export async function writeSubtitleSidecar(
  outputPath: string,
  request: ExportVideoRequest
): Promise<string | null> {
  const trimEnd = request.trimEnd ?? Number.POSITIVE_INFINITY;
  const cues = request.subtitles
    .filter((subtitle) => subtitle.end > request.trimStart && subtitle.start < trimEnd)
    .map((subtitle) => ({
      start: Math.max(0, subtitle.start - request.trimStart),
      end: Math.max(0, Math.min(subtitle.end, trimEnd) - request.trimStart),
      text: sanitizeSrtText(subtitle.text)
    }))
    .filter((subtitle) => subtitle.end > subtitle.start && subtitle.text.length > 0);
  if (cues.length === 0) return null;

  const subtitlePath = outputPath.replace(/\.[^.]+$/, "") + ".srt";
  // SRT delimits cues with a blank line, so any blank line inside cue text ends
  // the cue early. Build each block with CRLF (widest player support) and
  // separate blocks with a blank CRLF line.
  const srt =
    cues
      .map((cue, index) =>
        [
          `${index + 1}`,
          `${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}`,
          cue.text
        ].join("\r\n")
      )
      .join("\r\n\r\n") + "\r\n";
  await fs.writeFile(subtitlePath, srt, "utf8");
  return subtitlePath;
}

// Keep cue text from corrupting the SRT structure: normalize to CRLF, drop
// blank lines (they would end the cue early), and neutralize any "-->" that
// could be misread as a timing line.
function sanitizeSrtText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/-->/g, "->"))
    .filter((line) => line.length > 0)
    .join("\r\n");
}

function formatSrtTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
