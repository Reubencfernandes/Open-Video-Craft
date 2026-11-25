/**
 * On-disk project store: creates project folders, appends recording chunks
 * per track, finalizes recordings, persists editor state + imports, and
 * resolves media paths safely inside the project root.
 */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createDefaultEdits,
  createDefaultProjectFile,
  createDefaultSubtitles
} from "../shared/defaults";
import {
  createProjectFolderName,
  createWavTrackId,
  getMediaTrackRelativePath,
  importsDirectoryName,
  mediaDirectoryName,
  parseMediaTrackKey,
  recordingTrackToMediaTrack,
  slugify
} from "./project-paths";
import {
  exists,
  isEditorProjectImportInput,
  readProjectFile,
  sanitizeDurationMs,
  writeJsonFileAtomic
} from "./project-file";
import { readEditorDocument, saveEditorDocument } from "./editor-document-store";
import { assertProjectDeletionTarget } from "./project-deletion";
import { resolveContainedProjectPath } from "./project-containment";
import type { EditorStateSnapshot } from "../shared/editor-domain";
import type {
  EditorProjectImport,
  EditorProjectImportInput,
  EditorProjectStateFile,
  FailRecordingRequest,
  MediaTrackKey,
  ProjectFile,
  ProjectRecordingTrack,
  ProjectTrack,
  ProjectView,
  RecordingCapture,
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

// Re-exported so existing importers (and tests) can keep sourcing these from
// the project store; they now live in ./project-paths.
export { createProjectFolderName, getMediaTrackRelativePath, slugify };

export class ProjectStore {
  private readonly appVersion: string;
  private readonly clock: () => Date;
  private readonly records = new Map<string, ProjectRecord>();
  private readonly createdProjectIds = new Set<string>();
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
    const rootPath = await this.reserveProjectFolder(
      input.baseDirectory,
      createProjectFolderName(safeName, nowDate)
    );
    const id = randomUUID();

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
    await this.writeProjectFiles(record);
    this.records.set(id, record);
    this.createdProjectIds.add(id);
    return this.toView(record);
  }

  getProject(projectId: string): ProjectView {
    return this.toView(this.getRecord(projectId));
  }

  async renameProject(projectId: string, name: string): Promise<ProjectView> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      const safeName = name.trim() || "Untitled Recording";
      record.file = {
        ...record.file,
        name: safeName,
        updatedAt: this.clock().toISOString()
      };
      await this.writeProject(record);
      return this.toView(record);
    });
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

  // Drop any cached in-memory record without touching disk. Used after the
  // project folder has already been deleted (e.g. moved to the OS Trash) so a
  // later lookup does not resurrect a stale record.
  forgetProject(projectId: string): void {
    this.records.delete(projectId);
    this.createdProjectIds.delete(projectId);
  }

  async discardProject(projectId: string): Promise<boolean> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      if (!this.createdProjectIds.has(projectId) || !["created", "recording"].includes(record.file.status)) {
        throw new Error("Only an unfinished recording created in this session can be discarded. Use Move to Trash for saved projects.");
      }
      await assertProjectDeletionTarget(record.rootPath, projectId);
      await fs.rm(record.rootPath, { recursive: true, force: true });
      this.forgetProject(projectId);
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
        ...(request.sources?.length ? { sources: request.sources } : {}),
        devices: request.devices,
        startedAt: now,
        stoppedAt: null,
        durationMs: null,
        error: null,
        ...(request.captures?.length
          ? { recordingTracks: createProjectRecordingTracks(request.captures) }
          : {}),
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
    track: string,
    chunk: ArrayBuffer | Buffer
  ): Promise<ProjectView> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      if (record.file.status !== "recording") {
        throw new Error("Cannot append media after recording has stopped.");
      }

      const mediaTrack = resolveRecordingMediaTrack(record.file.tracks, track);
      const projectTrack = mediaTrack ? record.file.tracks[mediaTrack] : undefined;

      if (!mediaTrack || !projectTrack) {
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
      const hasRecordedAudio = hasRecordedAudioTracks(record.file);
      record.file = {
        ...record.file,
        updatedAt: now,
        status: hasRecordedAudio ? "processing" : "complete",
        durationMs: sanitizeDurationMs(request.durationMs),
        stoppedAt: now
      };

      await this.writeProject(record);
      return this.toView(record);
    });
  }

  async completeAudio(
    projectId: string,
    wavBytes: { mic: number; system: number } | Array<{ trackId: string; bytes: number }>,
    mediaDurationMs: number | null = null
  ): Promise<ProjectView> {
    return this.runProjectOperation(projectId, async () => {
      const record = this.getRecord(projectId);
      const now = this.clock().toISOString();
      const outputs = Array.isArray(wavBytes)
        ? wavBytes.map((output) => ({
            trackId: createWavTrackId(output.trackId as MediaTrackKey),
            bytes: output.bytes
          }))
        : [
            { trackId: createWavTrackId("micWebm"), bytes: wavBytes.mic },
            { trackId: createWavTrackId("systemWebm"), bytes: wavBytes.system }
          ];

      for (const output of outputs) {
        if (!output.trackId || output.bytes <= 0) continue;
        record.file.tracks[output.trackId] = {
          path: getMediaTrackRelativePath(output.trackId),
          mimeType: "audio/wav",
          bytesWritten: output.bytes,
          createdAt: now,
          updatedAt: now
        };
      }
      record.file = {
        ...record.file,
        updatedAt: now,
        status: "complete",
        durationMs: mediaDurationMs === null
          ? record.file.durationMs
          : sanitizeDurationMs(mediaDurationMs),
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
      baseRevision?: number;
      state: EditorStateSnapshot;
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
      return saveEditorDocument({
        rootPath: record.rootPath,
        baseRevision: input.baseRevision ?? 0,
        state: input.state,
        imports,
        source: "editor"
      });
    });
  }

  async readEditorState(projectId: string): Promise<EditorProjectStateFile | null> {
    const record = this.getRecord(projectId);
    return readEditorDocument(record.rootPath);
  }

  resolveProjectFile(projectId: string, relativePath: string): string {
    const record = this.getRecord(projectId);
    return resolveContainedProjectPath(record.rootPath, relativePath);
  }

  getMicWebmPath(projectId: string): string | null {
    const track = this.getRecord(projectId).file.tracks.micWebm;
    return track ? this.resolveProjectFile(projectId, track.path) : null;
  }

  getMicWavPath(projectId: string): string {
    return this.resolveProjectFile(projectId, getMediaTrackRelativePath("micWav"));
  }

  getSystemWebmPath(projectId: string): string | null {
    const track = this.getRecord(projectId).file.tracks.systemWebm;
    return track ? this.resolveProjectFile(projectId, track.path) : null;
  }

  getSystemWavPath(projectId: string): string {
    return this.resolveProjectFile(projectId, getMediaTrackRelativePath("systemWav"));
  }

  getMediaPath(projectId: string, track: MediaTrackKey): string | null {
    const projectTrack = this.getRecord(projectId).file.tracks[track];
    return projectTrack ? this.resolveProjectFile(projectId, projectTrack.path) : null;
  }

  /**
   * Every track this recording is producing, in capture order. Legacy projects
   * (written before multi-source support) only persisted the legacy track keys,
   * so they are derived here instead of requiring a project.json migration.
   */
  getRecordedTracks(
    projectId: string
  ): Array<{ trackId: MediaTrackKey; kind: RecordingTrack }> {
    const file = this.getRecord(projectId).file;
    if (file.recordingTracks?.length) {
      return file.recordingTracks.map((track) => ({
        trackId: track.trackId,
        kind: track.kind
      }));
    }

    const legacy: Array<{ trackId: MediaTrackKey; kind: RecordingTrack }> = [];
    if (file.tracks.screen) legacy.push({ trackId: "screen", kind: "screen" });
    if (file.tracks.camera) legacy.push({ trackId: "camera", kind: "camera" });
    if (file.tracks.micWebm) legacy.push({ trackId: "micWebm", kind: "mic" });
    if (file.tracks.systemWebm) legacy.push({ trackId: "systemWebm", kind: "system" });
    return legacy;
  }

  /** Absolute output path for the post-processed WAV of an audio track. */
  getWavOutputPath(projectId: string, trackId: MediaTrackKey): string | null {
    const wavTrackId = createWavTrackId(trackId);
    return wavTrackId
      ? this.resolveProjectFile(projectId, getMediaTrackRelativePath(wavTrackId))
      : null;
  }

  private createRecordingTracks(
    request: StartRecordingRequest,
    now: string
  ): Partial<Record<MediaTrackKey, ProjectTrack>> {
    if (request.captures?.length) {
      const tracks: Partial<Record<MediaTrackKey, ProjectTrack>> = {};

      for (const capture of request.captures) {
        if (tracks[capture.trackId]) {
          throw new Error(`Recording plan contains track "${capture.trackId}" twice.`);
        }
        tracks[capture.trackId] = this.createTrack(
          capture.trackId,
          capture.mimeType,
          now
        );
      }

      return tracks;
    }

    const tracks: Partial<Record<MediaTrackKey, ProjectTrack>> = {
      [recordingTrackToMediaTrack.screen]: this.createTrack("screen", request.tracks.screen.mimeType, now)
    };

    if (request.tracks.camera.enabled && request.tracks.camera.mimeType) {
      tracks[recordingTrackToMediaTrack.camera] = this.createTrack(
        "camera",
        request.tracks.camera.mimeType,
        now
      );
    }

    if (request.tracks.mic.enabled && request.tracks.mic.mimeType) {
      tracks[recordingTrackToMediaTrack.mic] = this.createTrack(
        "micWebm",
        request.tracks.mic.mimeType,
        now
      );
    }

    if (request.tracks.system?.enabled && request.tracks.system.mimeType) {
      tracks[recordingTrackToMediaTrack.system] = this.createTrack(
        "systemWebm",
        request.tracks.system.mimeType,
        now
      );
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

  private async reserveProjectFolder(
    baseDirectory: string,
    requestedName: string
  ): Promise<string> {
    let candidate = requestedName;
    let suffix = 1;

    await fs.mkdir(baseDirectory, { recursive: true });
    while (true) {
      const rootPath = path.resolve(baseDirectory, candidate);
      try {
        // Exclusive directory creation reserves the name even when two windows
        // create identically named projects in the same millisecond.
        await fs.mkdir(rootPath);
        return rootPath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        suffix += 1;
        candidate = `${requestedName}-${suffix}`;
      }
    }
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

/** Resolve the media track a recording chunk belongs to. */
function resolveRecordingMediaTrack(
  tracks: ProjectFile["tracks"],
  requestedTrack: string
): MediaTrackKey | null {
  const exact = parseMediaTrackKey(requestedTrack);
  if (exact && tracks[exact]) {
    return exact;
  }

  // Older renderers write chunks under the recording kind instead of the media
  // track id; keep those payloads working.
  const legacyTrack = recordingTrackToMediaTrack[requestedTrack as RecordingTrack];
  return legacyTrack && tracks[legacyTrack] ? legacyTrack : null;
}

function createProjectRecordingTracks(
  captures: RecordingCapture[]
): ProjectRecordingTrack[] {
  return captures.map((capture) => ({
    trackId: capture.trackId,
    kind: capture.kind,
    sourceId: capture.sourceId,
    label: capture.label
  }));
}

/** True when the recording still has audio track work to post-process. */
function hasRecordedAudioTracks(file: ProjectFile): boolean {
  if (file.recordingTracks?.length) {
    return file.recordingTracks.some(
      (track) =>
        (track.kind === "mic" || track.kind === "system") &&
        Boolean(file.tracks[track.trackId])
    );
  }

  return Boolean(file.tracks.micWebm || file.tracks.systemWebm);
}
