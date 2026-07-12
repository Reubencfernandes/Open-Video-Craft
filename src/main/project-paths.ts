/**
 * Project folder layout: the on-disk directory/file names, the mapping from
 * recording tracks to stored media tracks, and helpers for deriving a project
 * folder name. Paths are kept slash-normalized so a project folder can move
 * between macOS, Windows, and Linux.
 */
import type { MediaTrackKey, RecordingTrack } from "../shared/types";

export const mediaDirectoryName = "media";
export const importsDirectoryName = "imports";
export const editorStateFileName = "editor.json";

export const recordingTrackToMediaTrack: Record<RecordingTrack, MediaTrackKey> = {
  screen: "screen",
  camera: "camera",
  mic: "micWebm",
  system: "systemWebm"
};

export const mediaTrackRelativePaths: Record<MediaTrackKey, string> = {
  screen: `${mediaDirectoryName}/screen.webm`,
  camera: `${mediaDirectoryName}/camera.webm`,
  micWebm: `${mediaDirectoryName}/mic.webm`,
  micWav: `${mediaDirectoryName}/mic.wav`,
  systemWebm: `${mediaDirectoryName}/system.webm`,
  systemWav: `${mediaDirectoryName}/system.wav`
};

export function getMediaTrackRelativePath(track: MediaTrackKey): string {
  return mediaTrackRelativePaths[track];
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
