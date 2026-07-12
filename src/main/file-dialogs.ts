/**
 * Native open/save dialogs: project folder selection, media import (with kind
 * classification), and export destination.
 */
import { dialog } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ExportVideoRequest,
  ImportedMediaFile,
  ImportedMediaKind
} from "../shared/types";

export async function chooseBaseDirectory(
  parentWindow: Electron.BrowserWindow | null
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Choose where Open Video Craft should save this project",
    properties: ["openDirectory", "createDirectory"]
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

export async function chooseExistingProjectFolder(
  parentWindow: Electron.BrowserWindow | null
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Open an Open Video Craft project folder",
    properties: ["openDirectory"]
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

export async function importMediaFiles(
  parentWindow: Electron.BrowserWindow | null,
  registerImport: (id: string, filePath: string) => void
): Promise<ImportedMediaFile[]> {
  const options: Electron.OpenDialogOptions = {
    title: "Import media into Open Video Craft",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: [
          "mp4",
          "mov",
          "mkv",
          "webm",
          "avi",
          "mp3",
          "wav",
          "m4a",
          "aac",
          "ogg",
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif"
        ]
      },
      { name: "All Files", extensions: ["*"] }
    ]
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map((filePath) => describeImportedFile(filePath, registerImport));
}

/**
 * Import media from an explicit set of file paths (e.g. an OS drag-and-drop
 * onto the media panel) rather than the open dialog. Directories and paths that
 * can't be stat'd as regular files are skipped so a stray drop can't register a
 * bogus source; unsupported file types still flow through and are rejected by
 * the renderer's own partitioning, matching the "All Files" dialog behaviour.
 */
export async function importMediaFromPaths(
  filePaths: string[],
  registerImport: (id: string, filePath: string) => void
): Promise<ImportedMediaFile[]> {
  const imported: ImportedMediaFile[] = [];

  for (const filePath of filePaths) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }
    } catch {
      continue;
    }

    imported.push(describeImportedFile(filePath, registerImport));
  }

  return imported;
}

function describeImportedFile(
  filePath: string,
  registerImport: (id: string, filePath: string) => void
): ImportedMediaFile {
  const id = randomUUID();
  registerImport(id, filePath);
  const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();

  return {
    id,
    name: path.basename(filePath),
    path: filePath,
    url: `ovc-import://file/${encodeURIComponent(id)}`,
    kind: getImportedMediaKind(extension),
    extension
  };
}

export async function chooseExportPath(
  parentWindow: Electron.BrowserWindow | null,
  input: {
    format: ExportVideoRequest["format"];
    name: string;
  }
): Promise<string | null> {
  const extension = input.format;
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, createExportDialogOptions(input.name, extension))
    : await dialog.showSaveDialog(createExportDialogOptions(input.name, extension));

  if (result.canceled || !result.filePath) {
    return null;
  }

  if (path.extname(result.filePath).toLowerCase() === `.${extension}`) {
    return result.filePath;
  }

  // The OS save dialog only ran its overwrite check against the exact name the
  // user typed. Appending the format extension can land on an existing file that
  // the dialog never warned about — confirm before clobbering it.
  const finalPath = `${result.filePath}.${extension}`;
  if (await pathExists(finalPath)) {
    const confirmed = await confirmOverwrite(parentWindow, finalPath);
    if (!confirmed) {
      return null;
    }
  }

  return finalPath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function confirmOverwrite(
  parentWindow: Electron.BrowserWindow | null,
  filePath: string
): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    buttons: ["Replace", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Replace file?",
    message: `"${path.basename(filePath)}" already exists.`,
    detail: `A file with that name already exists at:\n${filePath}\nReplacing it overwrites its current contents.`
  };
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);

  return response === 0;
}

function createExportDialogOptions(
  name: string,
  extension: ExportVideoRequest["format"]
): Electron.SaveDialogOptions {
  return {
    title: "Export video",
    defaultPath: `${slugForFileName(name)}.${extension}`,
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: "Video", extensions: ["mp4", "webm", "mov"] }
    ]
  };
}

function getImportedMediaKind(extension: string): ImportedMediaKind {
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
    return "audio";
  }

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
    return "image";
  }

  return "video";
}

function slugForFileName(value: string): string {
  const safeValue = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return safeValue || "open-video-craft-export";
}
