/**
 * Project/editor file persistence and validation: atomic JSON writes (with
 * retry against transient sync/AV locks), reading and validating `project.json`
 * and editor state, and the shape guards for persisted media tracks and
 * imports. All functions here are pure aside from their file I/O.
 */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseEditorDocument } from "../shared/editor-domain";
import { importsDirectoryName, mediaTrackRelativePaths } from "./project-paths";
import type {
  EditorProjectImport,
  EditorProjectImportInput,
  EditorProjectStateFile,
  MediaTrackKey,
  ProjectFile,
  ProjectTrack
} from "../shared/types";

export async function readProjectFile(rootPath: string): Promise<ProjectFile> {
  const filePath = path.join(path.resolve(rootPath), "project.json");
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ProjectFile>;

  if (
    parsed.schemaVersion !== 1 ||
    !isNonEmptyString(parsed.id) ||
    !isNonEmptyString(parsed.name) ||
    !isNonEmptyString(parsed.updatedAt) ||
    !isValidProjectTracks(parsed.tracks)
  ) {
    throw new Error(`"${filePath}" is not a valid Open Video Craft project.`);
  }

  return parsed as ProjectFile;
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(tempPath, content);
    await renameWithRetry(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

// OneDrive/Dropbox sync agents and Windows AV scanners briefly lock the
// destination file, making an otherwise-atomic rename fail with
// EPERM/EBUSY/EACCES even though nothing is wrong. A few short backoff retries
// clear those transient locks without masking a genuine failure.
async function renameWithRetry(from: string, to: string, attempts = 3): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!transient || attempt >= attempts) {
        throw error;
      }
      await sleep(attempt * 120);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeDurationMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function cloneJsonValue(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string" || Buffer.byteLength(serialized) > 10 * 1024 * 1024) {
    throw new Error("Editor state must be valid JSON smaller than 10 MB.");
  }

  return JSON.parse(serialized) as unknown;
}

function isValidProjectTracks(value: unknown): value is ProjectFile["tracks"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  for (const [key, track] of Object.entries(value)) {
    if (!(key in mediaTrackRelativePaths) || !isValidProjectTrack(key as MediaTrackKey, track)) {
      return false;
    }
  }

  return true;
}

function isValidProjectTrack(key: MediaTrackKey, value: unknown): value is ProjectTrack {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const track = value as Partial<ProjectTrack>;
  return (
    normalizeRelativePath(track.path) === mediaTrackRelativePaths[key] &&
    isNonEmptyString(track.mimeType) &&
    typeof track.bytesWritten === "number" &&
    Number.isFinite(track.bytesWritten) &&
    track.bytesWritten >= 0 &&
    isNonEmptyString(track.createdAt) &&
    isNonEmptyString(track.updatedAt)
  );
}

export function isEditorProjectStateFile(value: unknown): value is EditorProjectStateFile {
  const document = parseEditorDocument(value);
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion === 2 &&
    document && document.imports.every(isEditorProjectImport)
  );
}

export function parseEditorProjectStateFile(value: unknown): EditorProjectStateFile | null {
  const document = parseEditorDocument(value);
  return document && document.imports.every(isEditorProjectImport)
    ? document as EditorProjectStateFile
    : null;
}

function isEditorProjectImport(value: unknown): value is EditorProjectImport {
  return (
    isEditorProjectImportInput(value) &&
    typeof (value as Partial<EditorProjectImport>).relativePath === "string" &&
    normalizeRelativePath((value as Partial<EditorProjectImport>).relativePath) ===
      `${importsDirectoryName}/${(value as EditorProjectImport).id}.${(value as EditorProjectImport).extension}`
  );
}

export function isEditorProjectImportInput(value: unknown): value is EditorProjectImportInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const imported = value as Partial<EditorProjectImportInput>;
  return (
    typeof imported.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(imported.id) &&
    isNonEmptyString(imported.name) &&
    (imported.kind === "video" || imported.kind === "audio" || imported.kind === "image") &&
    typeof imported.extension === "string" &&
    /^[a-zA-Z0-9]{1,12}$/.test(imported.extension) &&
    (imported.duration === null ||
      (typeof imported.duration === "number" &&
        Number.isFinite(imported.duration) &&
        imported.duration >= 0))
  );
}

function normalizeRelativePath(value: unknown): string {
  return typeof value === "string" ? value.replace(/\\/g, "/") : "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
