/**
 * Persists and restores macOS App Sandbox security-scoped bookmarks.
 *
 * Projects deliberately live in folders chosen by the user. A Mac App Store
 * build only receives temporary access from NSOpenPanel unless the returned
 * bookmark is retained and reopened on the next launch.
 */
import { app } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

interface StoredBookmark {
  path: string;
  bookmark: string;
}

interface StoredBookmarkFile {
  schemaVersion: 1;
  resources: StoredBookmark[];
}

export class SecurityScopedResourceManager {
  private readonly stopAccessing = new Map<string, () => void>();
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async restoreAll(): Promise<void> {
    if (!isMacAppStoreBuild()) return;

    const file = await this.readFile();
    for (const resource of file.resources) {
      this.startAccess(resource);
    }
  }

  async remember(resourcePath: string, bookmark: string | undefined): Promise<void> {
    if (!isMacAppStoreBuild() || !bookmark) return;

    const resource = {
      path: path.resolve(resourcePath),
      bookmark
    };
    this.startAccess(resource);

    await this.enqueue(async () => {
      const file = await this.readFile();
      const resources = [
        resource,
        ...file.resources.filter((item) => path.resolve(item.path) !== resource.path)
      ];
      await this.writeFile({ schemaVersion: 1, resources });
    });
  }

  activate(resourcePath: string, bookmark: string | undefined): void {
    if (!isMacAppStoreBuild() || !bookmark) return;
    this.startAccess({ path: path.resolve(resourcePath), bookmark });
  }

  stopAll(): void {
    for (const stop of this.stopAccessing.values()) {
      try {
        stop();
      } catch {
        // The OS may already have ended a scope while the app is terminating.
      }
    }
    this.stopAccessing.clear();
  }

  private startAccess(resource: StoredBookmark): void {
    const resolvedPath = path.resolve(resource.path);
    if (this.stopAccessing.has(resolvedPath)) return;

    try {
      const stop = app.startAccessingSecurityScopedResource(resource.bookmark);
      this.stopAccessing.set(resolvedPath, stop as () => void);
    } catch (error) {
      console.warn(`Could not restore sandbox access to "${resolvedPath}".`, error);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readFile(): Promise<StoredBookmarkFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredBookmarkFile>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.resources)) {
        return {
          schemaVersion: 1,
          resources: parsed.resources.filter(isStoredBookmark)
        };
      }
    } catch {
      // A missing or corrupt bookmark file is recoverable through the picker.
    }
    return { schemaVersion: 1, resources: [] };
  }

  private async writeFile(file: StoredBookmarkFile): Promise<void> {
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

export function isMacAppStoreBuild(): boolean {
  return process.platform === "darwin" && process.mas === true;
}

function isStoredBookmark(value: unknown): value is StoredBookmark {
  if (!value || typeof value !== "object") return false;
  const resource = value as Partial<StoredBookmark>;
  return typeof resource.path === "string" && typeof resource.bookmark === "string";
}
