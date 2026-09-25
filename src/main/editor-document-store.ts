/** Cross-process editor.json transactions shared by Electron and the MCP server. */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  applyEditorOperations,
  parseEditorDocument,
  validateEditorStateSnapshot
} from "../shared/editor-domain";
import type {
  EditorDocument,
  EditorEditOperation,
  EditorEditResult,
  EditorMutation,
  EditorStateSnapshot
} from "../shared/editor-domain";
import type { EditorProjectImport, EditorProjectStateFile } from "../shared/types";
import { parseEditorProjectStateFile, writeJsonFileAtomic } from "./project-file";
import { editorStateFileName } from "./project-paths";
import { resolveContainedProjectPath } from "./project-containment";

const metadataDirectoryName = ".ovc";
const historyLimit = 20;
const sessionFreshMs = 15_000;

export class EditorRevisionConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Editor revision changed from ${expected} to ${actual}. Inspect the project again before applying edits.`);
    this.name = "EditorRevisionConflictError";
  }
}

export class EditorDirtyError extends Error {
  constructor() {
    super("The project has unsaved changes in Open Video Craft. Wait for autosave, then retry.");
    this.name = "EditorDirtyError";
  }
}

export async function readEditorDocument(rootPath: string): Promise<EditorProjectStateFile | null> {
  try {
    const raw = JSON.parse(await fs.readFile(resolveContainedProjectPath(rootPath, editorStateFileName), "utf8")) as unknown;
    const document = parseEditorProjectStateFile(raw);
    if (!document) {
      throw new Error("This project's editor.json is invalid or from an unsupported version. The existing file has been preserved; repair it or restore a backup before saving.");
    }
    return document;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveEditorDocument(input: {
  rootPath: string;
  baseRevision: number;
  state: EditorStateSnapshot;
  imports: EditorProjectImport[];
  source: EditorMutation["source"];
  editId?: string | null;
  summary?: string | null;
  checkpoint?: boolean;
}): Promise<EditorProjectStateFile> {
  if (!validateEditorStateSnapshot(input.state)) throw new Error("Cannot save an invalid editor state.");
  return withEditorLock(input.rootPath, async () => {
    const current = await readEditorDocument(input.rootPath);
    const actualRevision = current?.revision ?? 0;
    if (actualRevision !== input.baseRevision) {
      throw new EditorRevisionConflictError(input.baseRevision, actualRevision);
    }
    const now = new Date().toISOString();
    const editId = input.editId ?? null;
    const next: EditorProjectStateFile = {
      schemaVersion: 2,
      revision: actualRevision + 1,
      savedAt: now,
      state: structuredClone(input.state),
      imports: structuredClone(input.imports),
      lastMutation: { source: input.source, at: now, editId, summary: input.summary ?? null }
    };
    if (!parseEditorProjectStateFile(next)) throw new Error("Cannot save invalid editor document metadata.");
    if (input.checkpoint && current && editId) {
      await writeCheckpoint(input.rootPath, editId, next.revision, current);
    }
    await writeJsonFileAtomic(path.join(input.rootPath, editorStateFileName), next);
    if (input.checkpoint) await pruneHistory(input.rootPath);
    return next;
  });
}

export async function applyAgentEdit(input: {
  rootPath: string;
  baseRevision: number;
  summary: string;
  operations: EditorEditOperation[];
}): Promise<{ document: EditorProjectStateFile; edit: EditorEditResult; editId: string }> {
  if (await hasFreshDirtySession(input.rootPath)) throw new EditorDirtyError();
  const current = await readEditorDocument(input.rootPath);
  if (!current) throw new Error("Open the project in Open Video Craft once before applying AI edits.");
  if (current.revision !== input.baseRevision) {
    throw new EditorRevisionConflictError(input.baseRevision, current.revision);
  }
  const edit = applyEditorOperations(current.state, input.operations);
  const editId = randomUUID();
  const document = await saveEditorDocument({
    rootPath: input.rootPath,
    baseRevision: input.baseRevision,
    state: edit.state,
    imports: current.imports,
    source: "agent",
    editId,
    summary: input.summary.slice(0, 500),
    checkpoint: true
  });
  return { document, edit, editId };
}

export async function undoAgentEdit(input: {
  rootPath: string;
  baseRevision: number;
  editId: string;
}): Promise<EditorProjectStateFile> {
  if (await hasFreshDirtySession(input.rootPath)) throw new EditorDirtyError();
  return withEditorLock(input.rootPath, async () => {
    const current = await readEditorDocument(input.rootPath);
    if (!current) throw new Error("This project has no saved editor state.");
    if (current.revision !== input.baseRevision) throw new EditorRevisionConflictError(input.baseRevision, current.revision);
    if (current.lastMutation.editId !== input.editId) {
      throw new Error("This edit can no longer be undone because a newer project revision exists.");
    }
    const checkpoint = await readCheckpoint(input.rootPath, input.editId);
    if (checkpoint.appliedRevision !== current.revision) throw new Error("The AI checkpoint does not match the current revision.");
    const now = new Date().toISOString();
    const restored: EditorProjectStateFile = {
      ...checkpoint.previous,
      schemaVersion: 2,
      revision: current.revision + 1,
      savedAt: now,
      lastMutation: { source: "editor", at: now, editId: null, summary: `Undid AI edit: ${current.lastMutation.summary ?? input.editId}` }
    };
    await writeJsonFileAtomic(path.join(input.rootPath, editorStateFileName), restored);
    return restored;
  });
}

export async function setEditorSessionState(rootPath: string, dirty: boolean): Promise<void> {
  const filePath = sessionPath(rootPath);
  if (!dirty) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    return;
  }
  await writeJsonFileAtomic(filePath, { pid: process.pid, dirty: true, updatedAt: Date.now() });
}

export async function hasFreshDirtySession(rootPath: string): Promise<boolean> {
  try {
    const session = JSON.parse(await fs.readFile(sessionPath(rootPath), "utf8")) as { dirty?: unknown; updatedAt?: unknown };
    return session.dirty === true && typeof session.updatedAt === "number" && Date.now() - session.updatedAt < sessionFreshMs;
  } catch {
    return false;
  }
}

export async function withEditorLock<T>(rootPath: string, operation: () => Promise<T>): Promise<T> {
  const directory = resolveContainedProjectPath(rootPath, metadataDirectoryName);
  const lockPath = path.join(directory, "editor.lock");
  await fs.mkdir(directory, { recursive: true });
  const startedAt = Date.now();
  while (true) {
    let handle;
    try {
      handle = await fs.open(lockPath, "wx");
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      const stale = await isStaleLock(lockPath);
      if (stale) {
        await fs.rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > 5_000) throw new Error("Timed out waiting for the editor project lock.");
      await new Promise((resolve) => setTimeout(resolve, 60));
      continue;
    }
    // Only acquisition errors are retried. Retrying an operation that throws
    // EEXIST could repeat a partially completed mutation.
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      return await operation();
    } finally {
      await handle.close();
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

function sessionPath(rootPath: string) { return resolveContainedProjectPath(rootPath, `${metadataDirectoryName}/session.json`); }
function historyPath(rootPath: string) { return resolveContainedProjectPath(rootPath, `${metadataDirectoryName}/history`); }
function checkpointPath(rootPath: string, editId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editId)) {
    throw new Error("Invalid AI checkpoint id.");
  }
  return resolveContainedProjectPath(rootPath, `${metadataDirectoryName}/history/${editId}.json`);
}

async function writeCheckpoint(rootPath: string, editId: string, appliedRevision: number, previous: EditorProjectStateFile) {
  await writeJsonFileAtomic(checkpointPath(rootPath, editId), { editId, appliedRevision, createdAt: new Date().toISOString(), previous });
}
async function readCheckpoint(rootPath: string, editId: string): Promise<{ appliedRevision: number; previous: EditorProjectStateFile }> {
  const value = JSON.parse(await fs.readFile(checkpointPath(rootPath, editId), "utf8")) as any;
  const previous = parseEditorProjectStateFile(value.previous);
  if (!previous || typeof value.appliedRevision !== "number") throw new Error("The AI edit checkpoint is invalid or unavailable.");
  return { appliedRevision: value.appliedRevision, previous: previous as EditorProjectStateFile };
}
async function pruneHistory(rootPath: string) {
  const directory = historyPath(rootPath);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => ({
    path: path.join(directory, entry.name),
    mtime: (await fs.stat(path.join(directory, entry.name))).mtimeMs
  })));
  for (const file of files.sort((a, b) => b.mtime - a.mtime).slice(historyLimit)) await fs.rm(file.path, { force: true });
}
async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const value = JSON.parse(await fs.readFile(lockPath, "utf8")) as { pid?: unknown; createdAt?: unknown };
    if (Number.isInteger(value.pid) && (value.pid as number) > 0) {
      // A slow operation still owns its lock. EPERM also means that the
      // process may be alive; only ESRCH establishes that its owner exited.
      try { process.kill(value.pid as number, 0); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
  }
  // Another writer may have created the lock but not written its metadata yet.
  // Do not steal a fresh empty or partially written lock.
  const stats = await fs.stat(lockPath).catch(() => null);
  return stats !== null && Date.now() - stats.mtimeMs > 30_000;
}

export type { EditorDocument };
