/**
 * Project folder layout: the on-disk directory/file names, the mapping from
 * recording tracks to stored media tracks, and helpers for deriving a project
 * folder name. Paths are kept slash-normalized so a project folder can move
 * between macOS, Windows, and Linux.
 */
import type { MediaTrackKey, RecordingTrack } from "../shared/types";
import { legacyRecordingTrackIds } from "../shared/types";

export const mediaDirectoryName = "media";
export const importsDirectoryName = "imports";
export const editorStateFileName = "editor.json";

export const recordingTrackToMediaTrack: Record<RecordingTrack, MediaTrackKey> =
  legacyRecordingTrackIds;

export const mediaTrackRelativePaths: Record<
  "screen" | "camera" | "micWebm" | "micWav" | "systemWebm" | "systemWav",
  string
> = {
  screen: `${mediaDirectoryName}/screen.webm`,
  camera: `${mediaDirectoryName}/camera.webm`,
  micWebm: `${mediaDirectoryName}/mic.webm`,
  micWav: `${mediaDirectoryName}/mic.wav`,
  systemWebm: `${mediaDirectoryName}/system.webm`,
  systemWav: `${mediaDirectoryName}/system.wav`
};

// Re-exported so main-process callers can resolve recording track contracts
// from one place; the canonical ids live in shared/types.
export {
  createRecordingTrackId,
  createWavTrackId,
  getRecordingKindForTrackId,
  legacyRecordingTrackIds,
  maxRecordingTracksPerKind,
  parseMediaTrackKey
} from "../shared/types";

/**
 * Project-relative file for a media track. Additional sources get their own
 * file (`media/screen-2.webm`) and each audio track its own WAV output
 * (`media/mic-2.wav`, key `mic-2-wav`).
 */
export function getMediaTrackRelativePath(track: MediaTrackKey): string {
  const legacyPath = mediaTrackRelativePaths[track as keyof typeof mediaTrackRelativePaths];
  if (legacyPath) {
    return legacyPath;
  }

  const fileName = track.endsWith("-wav")
    ? `${track.slice(0, -"-wav".length)}.wav`
    : `${track}.webm`;
  return `${mediaDirectoryName}/${fileName}`;
}

export function createProjectFolderName(name: string, date: Date): string {
  const slug = slugify(name) || "untitled-recording";
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return `${slug}-${timestamp}`;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
