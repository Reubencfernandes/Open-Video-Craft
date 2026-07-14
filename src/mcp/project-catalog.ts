import { promises as fs } from "node:fs";
import path from "node:path";
import { readProjectFile } from "../main/project-file";
import type { ProjectFile, ProjectLibraryEntry } from "../shared/types";

export interface McpProjectRecord {
  entry: ProjectLibraryEntry;
  project: ProjectFile;
  rootPath: string;
  active: boolean;
}

export async function listCatalogProjects(userDataPath: string): Promise<McpProjectRecord[]> {
  const [library, active] = await Promise.all([
    readJson(path.join(userDataPath, "projects.json")),
    readJson(path.join(userDataPath, "active-editor.json"))
  ]);
  const entries = isRecord(library) && Array.isArray(library.projects)
    ? library.projects.filter(isLibraryEntry)
    : [];
  const activeProjectId = isRecord(active) && typeof active.projectId === "string" ? active.projectId : null;
  const records = await Promise.all(entries.map(async (entry): Promise<McpProjectRecord | null> => {
    try {
      const rootPath = path.resolve(entry.rootPath);
      const project = await readProjectFile(rootPath);
      if (project.id !== entry.id) return null;
      return { entry, project, rootPath, active: project.id === activeProjectId };
    } catch {
      return null;
    }
  }));
  return records.filter((record): record is McpProjectRecord => Boolean(record));
}

export async function resolveCatalogProject(userDataPath: string, projectId?: string | null): Promise<McpProjectRecord> {
  const projects = await listCatalogProjects(userDataPath);
  const record = projectId
    ? projects.find((item) => item.project.id === projectId)
    : projects.find((item) => item.active) ?? projects[0];
  if (!record) throw new Error(projectId ? `Unknown Open Video Craft project "${projectId}".` : "No Open Video Craft projects are available.");
  return record;
}

async function readJson(filePath: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown; } catch { return null; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isLibraryEntry(value: unknown): value is ProjectLibraryEntry {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.rootPath === "string" && typeof value.updatedAt === "string" && typeof value.available === "boolean";
}
