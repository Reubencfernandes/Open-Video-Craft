import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createDefaultEdits,
  createDefaultProjectFile,
  createDefaultSubtitles
} from "../shared/defaults";
import type {
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

const recordingTrackToMediaTrack: Record<RecordingTrack, MediaTrackKey> = {
  screen: "screen",
  camera: "camera",
  mic: "micWebm"
};

const mediaTrackRelativePaths: Record<MediaTrackKey, string> = {
  screen: path.join(mediaDirectoryName, "screen.webm"),
  camera: path.join(mediaDirectoryName, "camera.webm"),
  micWebm: path.join(mediaDirectoryName, "mic.webm"),
  micWav: path.join(mediaDirectoryName, "mic.wav")
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
    const id = folderName;
    const rootPath = path.resolve(input.baseDirectory, folderName);

    await fs.mkdir(path.join(rootPath, mediaDirectoryName), { recursive: true });

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

  async discardProject(projectId: string): Promise<boolean> {
    const record = this.getRecord(projectId);
    this.records.delete(projectId);
    await fs.rm(record.rootPath, { recursive: true, force: true });
    return true;
  }

  async startRecording(request: StartRecordingRequest): Promise<ProjectView> {
    const record = this.getRecord(request.projectId);
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
          await fs.writeFile(path.join(record.rootPath, track.path), "");
        }
      })
    );
    await this.writeProject(record);

    return this.toView(record);
  }

  async appendChunk(
    projectId: string,
    track: RecordingTrack,
    chunk: ArrayBuffer | Buffer
  ): Promise<ProjectView> {
    const record = this.getRecord(projectId);
    const mediaTrack = recordingTrackToMediaTrack[track];
    const projectTrack = record.file.tracks[mediaTrack];

    if (!projectTrack) {
      throw new Error(`Track "${track}" is not enabled for project "${projectId}".`);
    }

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (buffer.byteLength === 0) {
      return this.toView(record);
    }

    await fs.appendFile(path.join(record.rootPath, projectTrack.path), buffer);

    const now = this.clock().toISOString();
    record.file.tracks[mediaTrack] = {
      ...projectTrack,
      bytesWritten: projectTrack.bytesWritten + buffer.byteLength,
      updatedAt: now
    };
    record.file.updatedAt = now;
    await this.writeProject(record);

    return this.toView(record);
  }

  async stopRecording(request: StopRecordingRequest): Promise<ProjectView> {
    const record = this.getRecord(request.projectId);
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
  }

  async completeAudio(projectId: string, micWavBytes: number): Promise<ProjectView> {
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
  }

  async markFailed(request: FailRecordingRequest): Promise<ProjectView> {
    const record = this.getRecord(request.projectId);
    const now = this.clock().toISOString();

    record.file = {
      ...record.file,
      updatedAt: now,
      status: "failed",
      error: request.error
    };

    await this.writeProject(record);
    return this.toView(record);
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
      fs.writeFile(
        path.join(record.rootPath, "edits.json"),
        `${JSON.stringify(createDefaultEdits(), null, 2)}\n`
      ),
      fs.writeFile(
        path.join(record.rootPath, "subtitles.json"),
        `${JSON.stringify(createDefaultSubtitles(), null, 2)}\n`
      )
    ]);
  }

  private async writeProject(record: ProjectRecord): Promise<void> {
    await fs.writeFile(
      path.join(record.rootPath, "project.json"),
      `${JSON.stringify(record.file, null, 2)}\n`
    );
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
