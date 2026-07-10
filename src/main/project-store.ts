import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createDefaultEdits,
  createDefaultProjectFile,
  createDefaultSubtitles
} from "../shared/defaults";
import type {
  EditorProjectImport,
  EditorProjectImportInput,
  EditorProjectStateFile,
  FailRecordingRequest,
  MediaTrackKey,
  ProjectFile,
  ProjectTrack,
  ProjectView,
  RecordingTrack,
  StartRecordingRequest,
  StopRecordingRequest
} from "../shared/types";

interface ProjectRecord {
  rootPath: string;
  file: ProjectFile;
}

export interface ProjectStoreOptions {
  appVersion: string;
  clock?: () => Date;
}

const mediaDirectoryName = "media";
const importsDirectoryName = "imports";
const editorStateFileName = "editor.json";

const recordingTrackToMediaTrack: Record<RecordingTrack, MediaTrackKey> = {
  screen: "screen",
  camera: "camera",
  mic: "micWebm"
};

const mediaTrackRelativePaths: Record<MediaTrackKey, string> = {
  // Keep persisted paths slash-normalized: projects can move between macOS,
  // Windows, and Linux even though each host resolves the path natively.
  screen: `${mediaDirectoryName}/screen.webm`,
  camera: `${mediaDirectoryName}/camera.webm`,
  micWebm: `${mediaDirectoryName}/mic.webm`,
  micWav: `${mediaDirectoryName}/mic.wav`
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

export class ProjectStore {
  private readonly appVersion: string;
  private readonly clock: () => Date;
  private readonly records = new Map<string, ProjectRecord>();
  private readonly projectOperationQueues = new Map<string, Promise<void>>();

  constructor(options: ProjectStoreOptions) {
    this.appVersion = options.appVersion;
    this.clock = options.clock ?? (() => new Date());
  }

  async createProject(input: {
    name: string;
    baseDirectory: string;
  }): Promise<ProjectView> {
    const nowDate = this.clock();
    const now = nowDate.toISOString();
    const safeName = input.name.trim() || "Untitled Recording";
    const folderName = await this.getAvailableFolderName(
      input.baseDirectory,
      createProjectFolderName(safeName, nowDate)
    );
    const id = randomUUID();
    const rootPath = path.resolve(input.baseDirectory, folderName);

    await Promise.all([
      fs.mkdir(path.join(rootPath, mediaDirectoryName), { recursive: true }),
      fs.mkdir(path.join(rootPath, importsDirectoryName), { recursive: true })
    ]);

    const file = createDefaultProjectFile({
      appVersion: this.appVersion,
      id,
      name: safeName,
      now
    });

    const record: ProjectRecord = { rootPath, file };
    this.records.set(id, record);

    await this.writeProjectFiles(record);
    return this.toView(record);
  }

  getProject(projectId: string): ProjectView {
    return this.toView(this.getRecord(projectId));
  }

  hasProject(projectId: string): boolean {
    return this.records.has(projectId);
  }

  async loadProject(rootPath: string): Promise<ProjectView> {
    const resolvedRootPath = path.resolve(rootPath);
    const file = await readProjectFile(resolvedRootPath);
    const record: ProjectRecord = {
      rootPath: resolvedRootPath,
      file
    };

    const existing = this.records.get(file.id);
    if (existing && path.resolve(existing.rootPath) !== resolvedRootPath) {
      throw new Error(
        `Another project with id "${file.id}" is already open. Duplicate project folders must be assigned a new id before both can be opened.`
      );
    }

    this.records.set(file.id, record);
    return this.toView(record);
  }

  async discardProject(projectId: string): Promise<boolean> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      this.records.delete(projectId);
      await fs.rm(record.rootPath, { recursive: true, force: true });
      return true;
    });
  }

  async startRecording(request: StartRecordingRequest): Promise<ProjectView> {
    return this.runProjectOperation(request.projectId, async () => {
      const record = this.getRecord(request.projectId);
      if (record.file.status !== "created") {
        throw new Error("Recording can only be started for a newly created project.");
      }

      const now = this.clock().toISOString();
      record.file = {
        ...record.file,
        updatedAt: now,
        status: "recording",
        source: request.source,
        devices: request.devices,
        startedAt: now,
        stoppedAt: null,
        durationMs: null,
        error: null,
        tracks: this.createRecordingTracks(request, now)
      };

      await Promise.all(
        Object.values(record.file.tracks).map(async (track) => {
          if (track) {
            await fs.writeFile(this.resolveProjectFile(request.projectId, track.path), "");
          }
        })
      );
      await this.writeProject(record);

      return this.toView(record);
    });
  }

  async appendChunk(
    projectId: string,
    track: RecordingTrack,
    chunk: ArrayBuffer | Buffer
  ): Promise<ProjectView> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      if (record.file.status !== "recording") {
        throw new Error("Cannot append media after recording has stopped.");
      }

      const mediaTrack = recordingTrackToMediaTrack[track];
      const projectTrack = record.file.tracks[mediaTrack];

      if (!projectTrack) {
        throw new Error(`Track "${track}" is not enabled for project "${projectId}".`);
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buffer.byteLength === 0) {
        return this.toView(record);
      }

      await fs.appendFile(this.resolveProjectFile(projectId, projectTrack.path), buffer);

      const now = this.clock().toISOString();
      record.file.tracks[mediaTrack] = {
        ...projectTrack,
        bytesWritten: projectTrack.bytesWritten + buffer.byteLength,
        updatedAt: now
      };
      record.file.updatedAt = now;
      await this.writeProject(record);

      return this.toView(record);
    });
  }

  async stopRecording(request: StopRecordingRequest): Promise<ProjectView> {
    return this.runProjectOperation(request.projectId, async () => {
      const record = this.getRecord(request.projectId);
      if (record.file.status !== "recording") {
        throw new Error("Recording has already stopped.");
      }

      const now = this.clock().toISOString();
      record.file = {
        ...record.file,
        updatedAt: now,
        status: record.file.tracks.micWebm ? "processing" : "complete",
        durationMs: Math.max(0, Math.round(request.durationMs)),
        stoppedAt: now
      };

      await this.writeProject(record);
      return this.toView(record);
    });
  }

  async completeAudio(projectId: string, micWavBytes: number): Promise<ProjectView> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      const now = this.clock().toISOString();

      if (micWavBytes > 0) {
        record.file.tracks.micWav = {
          path: getMediaTrackRelativePath("micWav"),
          mimeType: "audio/wav",
          bytesWritten: micWavBytes,
          createdAt: now,
          updatedAt: now
        };
      }

      record.file = {
        ...record.file,
        updatedAt: now,
        status: "complete",
        error: null
      };

      await this.writeProject(record);
      return this.toView(record);
    });
  }

  async markFailed(request: FailRecordingRequest): Promise<ProjectView> {
    return this.runProjectOperation(request.projectId, async () => {
      const record = this.getRecord(request.projectId);
      if (record.file.status === "complete") {
        return this.toView(record);
      }

      const now = this.clock().toISOString();
      record.file = {
        ...record.file,
        updatedAt: now,
        status: "failed",
        error: request.error
      };

      await this.writeProject(record);
      return this.toView(record);
    });
  }

  async saveEditorState(
    projectId: string,
    input: {
      state: unknown;
      imports: EditorProjectImportInput[];
    },
    resolveImportedPath: (importId: string) => string | null
  ): Promise<EditorProjectStateFile> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      const imports = await Promise.all(
        input.imports.map((imported) =>
          this.persistEditorImport(record, imported, resolveImportedPath(imported.id))
        )
      );
      const file: EditorProjectStateFile = {
        schemaVersion: 1,
        savedAt: this.clock().toISOString(),
        state: cloneJsonValue(input.state),
        imports
      };

      await writeJsonFileAtomic(path.join(record.rootPath, editorStateFileName), file);
      return file;
    });
  }

  async readEditorState(projectId: string): Promise<EditorProjectStateFile | null> {
    const record = this.getRecord(projectId);
    const filePath = path.join(record.rootPath, editorStateFileName);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isEditorProjectStateFile(parsed)) {
        throw new Error(`"${filePath}" is not a valid Open Video Craft editor state file.`);
      }

      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  resolveProjectFile(projectId: string, relativePath: string): string {
    const record = this.getRecord(projectId);
    const normalizedRelative = relativePath.replace(/^[/\\]+/, "");
    const absolutePath = path.resolve(record.rootPath, normalizedRelative);
    const rootPath = path.resolve(record.rootPath);
    const rootWithSeparator = rootPath.endsWith(path.sep)
      ? rootPath
      : `${rootPath}${path.sep}`;

    if (absolutePath !== rootPath && !absolutePath.startsWith(rootWithSeparator)) {
      throw new Error("Requested project path is outside of the project folder.");
    }

    return absolutePath;
  }

  getMicWebmPath(projectId: string): string | null {
    const track = this.getRecord(projectId).file.tracks.micWebm;
    return track ? this.resolveProjectFile(projectId, track.path) : null;
  }

  getMicWavPath(projectId: string): string {
    return this.resolveProjectFile(projectId, getMediaTrackRelativePath("micWav"));
  }

  getMediaPath(projectId: string, track: MediaTrackKey): string | null {
    const projectTrack = this.getRecord(projectId).file.tracks[track];
    return projectTrack ? this.resolveProjectFile(projectId, projectTrack.path) : null;
  }

  private createRecordingTracks(
    request: StartRecordingRequest,
    now: string
  ): Partial<Record<MediaTrackKey, ProjectTrack>> {
    const tracks: Partial<Record<MediaTrackKey, ProjectTrack>> = {
      screen: this.createTrack("screen", request.tracks.screen.mimeType, now)
    };

    if (request.tracks.camera.enabled && request.tracks.camera.mimeType) {
      tracks.camera = this.createTrack("camera", request.tracks.camera.mimeType, now);
    }

    if (request.tracks.mic.enabled && request.tracks.mic.mimeType) {
      tracks.micWebm = this.createTrack("micWebm", request.tracks.mic.mimeType, now);
    }

    return tracks;
  }

  private createTrack(
    key: MediaTrackKey,
    mimeType: string,
    now: string
  ): ProjectTrack {
    return {
      path: getMediaTrackRelativePath(key),
      mimeType,
      bytesWritten: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  private async writeProjectFiles(record: ProjectRecord): Promise<void> {
    await Promise.all([
      this.writeProject(record),
      writeJsonFileAtomic(path.join(record.rootPath, "edits.json"), createDefaultEdits()),
      writeJsonFileAtomic(path.join(record.rootPath, "subtitles.json"), createDefaultSubtitles())
    ]);
  }

  private async writeProject(record: ProjectRecord): Promise<void> {
    await writeJsonFileAtomic(path.join(record.rootPath, "project.json"), record.file);
  }

  private async persistEditorImport(
    record: ProjectRecord,
    imported: EditorProjectImportInput,
    sourcePath: string | null
  ): Promise<EditorProjectImport> {
    if (!isEditorProjectImportInput(imported)) {
      throw new Error("An imported media item has invalid metadata.");
    }

    const relativePath = `${importsDirectoryName}/${imported.id}.${imported.extension}`;
    const destination = this.resolveProjectFile(record.file.id, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });

    if (sourcePath) {
      const source = path.resolve(sourcePath);
      if (source !== destination) {
        await fs.copyFile(source, destination);
      }
    } else if (!(await exists(destination))) {
      throw new Error(`Imported media "${imported.name}" is no longer available to save.`);
    }

    return {
      ...imported,
      relativePath
    };
  }

  private runProjectOperation<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.projectOperationQueues.get(projectId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.projectOperationQueues.set(projectId, tail);

    return run.finally(() => {
      if (this.projectOperationQueues.get(projectId) === tail) {
        this.projectOperationQueues.delete(projectId);
      }
    });
  }

  private async getAvailableFolderName(
    baseDirectory: string,
    requestedName: string
  ): Promise<string> {
    let candidate = requestedName;
    let suffix = 1;

    while (await exists(path.join(baseDirectory, candidate))) {
      suffix += 1;
      candidate = `${requestedName}-${suffix}`;
    }

    return candidate;
  }

  private getRecord(projectId: string): ProjectRecord {
    const record = this.records.get(projectId);

    if (!record) {
      throw new Error(`Unknown project "${projectId}".`);
    }

    return record;
  }

  private toView(record: ProjectRecord): ProjectView {
    const mediaUrls: ProjectView["mediaUrls"] = {};

    for (const [key, track] of Object.entries(record.file.tracks) as Array<
      [MediaTrackKey, ProjectTrack | undefined]
    >) {
      if (track && track.bytesWritten > 0) {
        mediaUrls[key] = createMediaUrl(record.file.id, track.path);
      }
    }

    return {
      ...record.file,
      rootPath: record.rootPath,
      mediaUrls
    };
  }
}

export function createMediaUrl(projectId: string, relativePath: string): string {
  const encodedPath = relativePath
    .split(/[\\/]+/)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `ovc-media://project/${encodeURIComponent(projectId)}/${encodedPath}`;
}

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

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function cloneJsonValue(value: unknown): unknown {
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

function isEditorProjectStateFile(value: unknown): value is EditorProjectStateFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<EditorProjectStateFile>;
  return (
    state.schemaVersion === 1 &&
    isNonEmptyString(state.savedAt) &&
    Array.isArray(state.imports) &&
    state.imports.every(isEditorProjectImport)
  );
}

function isEditorProjectImport(value: unknown): value is EditorProjectImport {
  return (
    isEditorProjectImportInput(value) &&
    typeof (value as Partial<EditorProjectImport>).relativePath === "string" &&
    normalizeRelativePath((value as Partial<EditorProjectImport>).relativePath) ===
      `${importsDirectoryName}/${(value as EditorProjectImport).id}.${(value as EditorProjectImport).extension}`
  );
}

function isEditorProjectImportInput(value: unknown): value is EditorProjectImportInput {
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
