/**
 * Recent-projects index persisted in userData; powers the launcher's project
 * list and editor project lookup.
 */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readProjectFile } from "./project-store";
import type {
  MediaTrackKey,
  ProjectFile,
  ProjectLibraryEntry,
  ProjectMediaAvailability,
  ProjectTrack,
  ProjectView
} from "../shared/types";

interface ProjectLibraryFile {
  schemaVersion: 1;
  projects: ProjectLibraryEntry[];
}

export class ProjectLibrary {
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async listRecent(): Promise<ProjectLibraryEntry[]> {
    return this.enqueue(() => this.listRecentUnlocked());
  }

  private async listRecentUnlocked(): Promise<ProjectLibraryEntry[]> {
    const file = await this.readFile();
    const refreshedProjects = await Promise.all(
      file.projects.map((entry) => this.refreshEntry(entry))
    );
    const projects = sortEntries(dedupeEntries(refreshedProjects));

    if (!areEntriesEqual(file.projects, projects)) {
      await this.writeFile({ schemaVersion: 1, projects });
    }

    return projects;
  }

  async get(projectId: string): Promise<ProjectLibraryEntry | null> {
    return this.enqueue(async () => {
      const projects = await this.listRecentUnlocked();
      return projects.find((entry) => entry.id === projectId) ?? null;
    });
  }

  async upsert(project: ProjectView): Promise<ProjectLibraryEntry> {
    return this.enqueue(async () => {
      const file = await this.readFile();
      const entry = createProjectLibraryEntry(project.rootPath, project, true);
      const projects = sortEntries([
        entry,
        ...file.projects.filter(
          (item) => item.id !== entry.id && path.resolve(item.rootPath) !== path.resolve(entry.rootPath)
        )
      ]);

      await this.writeFile({ schemaVersion: 1, projects });
      return entry;
    });
  }

  async remove(projectId: string): Promise<boolean> {
    return this.enqueue(async () => {
      const file = await this.readFile();
      const projects = file.projects.filter((entry) => entry.id !== projectId);

      if (projects.length === file.projects.length) {
        return false;
      }

      await this.writeFile({ schemaVersion: 1, projects });
      return true;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async refreshEntry(entry: ProjectLibraryEntry): Promise<ProjectLibraryEntry> {
    try {
      const file = await readProjectFile(entry.rootPath);
      return createProjectLibraryEntry(entry.rootPath, file, true);
    } catch {
      return {
        ...entry,
        available: false
      };
    }
  }

  private async readFile(): Promise<ProjectLibraryFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProjectLibraryFile>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.projects)) {
        return {
          schemaVersion: 1,
          projects: parsed.projects.filter(isProjectLibraryEntry)
        };
      }
    } catch {
      // Missing or corrupt library files should not prevent the app from opening.
    }

    return {
      schemaVersion: 1,
      projects: []
    };
  }

  private async writeFile(file: ProjectLibraryFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    const tempPath = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);

    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`);
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export function createProjectLibraryEntry(
  rootPath: string,
  project: ProjectFile,
  available: boolean
): ProjectLibraryEntry {
  return {
    id: project.id,
    name: project.name,
    rootPath: path.resolve(rootPath),
    status: project.status,
    durationMs: project.durationMs,
    updatedAt: project.updatedAt,
    mediaAvailability: createMediaAvailability(project.tracks),
    available,
    // The main IPC layer fills this after loading the project into ProjectStore.
    thumbnailUrl: null
  };
}

function createMediaAvailability(
  tracks: Partial<Record<MediaTrackKey, ProjectTrack>>
): ProjectMediaAvailability {
  return {
    screen: hasWrittenTrack(tracks.screen),
    camera: hasWrittenTrack(tracks.camera),
    audio: hasWrittenTrack(tracks.micWav) || hasWrittenTrack(tracks.micWebm)
  };
}

function hasWrittenTrack(track: ProjectTrack | undefined): boolean {
  return Boolean(track && track.bytesWritten > 0);
}

function sortEntries(entries: ProjectLibraryEntry[]): ProjectLibraryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function dedupeEntries(entries: ProjectLibraryEntry[]): ProjectLibraryEntry[] {
  const seen = new Set<string>();
  const result: ProjectLibraryEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.id}:${path.resolve(entry.rootPath)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  }

  return result;
}

function areEntriesEqual(
  left: ProjectLibraryEntry[],
  right: ProjectLibraryEntry[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isProjectLibraryEntry(value: unknown): value is ProjectLibraryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ProjectLibraryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.rootPath === "string" &&
    typeof entry.updatedAt === "string" &&
    typeof entry.available === "boolean" &&
    Boolean(entry.mediaAvailability)
  );
}
