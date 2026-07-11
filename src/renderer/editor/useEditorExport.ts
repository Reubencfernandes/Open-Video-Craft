/**
 * Export dialog state and the renderer side of export requests.
 */
import { useState } from "react";
import type {
  Dispatch,
  SetStateAction
} from "react";
import type {
  ExportResolution,
  ExportVideoFormat,
  ExportVideoRequest,
  ProjectView
} from "../../shared/types";
import type { EditorMediaItem } from "./types";
import { formatBytes } from "./utils";

type UseEditorExportParams = {
  backgroundAudioIds: string[];
  masterVolume: number;
  project: ProjectView | null;
  projectScreen: EditorMediaItem | null;
  selectedItem: EditorMediaItem | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  trimRange: { start: number; end: number };
};

export function useEditorExport(params: UseEditorExportParams) {
  const {
    backgroundAudioIds,
    masterVolume,
    project,
    projectScreen,
    selectedItem,
    setError,
    setExportMessage,
    trimRange
  } = params;
  const [exportFormat, setExportFormat] = useState<ExportVideoFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  function getExportSource(): ExportVideoRequest["source"] | null {
    if (selectedItem?.origin === "imported" && selectedItem.kind === "video") {
      return {
        kind: "import",
        importId: selectedItem.importId ?? selectedItem.id
      };
    }

    if (project && projectScreen) {
      return {
        kind: "project",
        projectId: project.id
      };
    }

    return null;
  }

  function closeExportDialog() {
    if (!exporting) {
      setExportDialogOpen(false);
    }
  }

  async function exportCurrentVideo() {
    const source = getExportSource();

    if (!source) {
      setError("Select a video clip before exporting.");
      return;
    }

    setError(null);
    setExportMessage(null);
    setExporting(true);

    try {
      const result = await window.openVideoCraft.editor.exportVideo({
        source,
        format: exportFormat,
        resolution: exportResolution,
        trimStart: trimRange.start,
        trimEnd: trimRange.end > trimRange.start ? trimRange.end : null,
        volume: masterVolume / 100,
        backgroundAudioImportIds: backgroundAudioIds
      });

      if (result) {
        setExportMessage(`Exported ${formatBytes(result.bytesWritten)} to ${result.path}`);
        setExportDialogOpen(false);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  }

  return {
    canExport: Boolean(getExportSource()),
    closeExportDialog,
    exportCurrentVideo,
    exportDialogOpen,
    exportFormat,
    exporting,
    exportResolution,
    openExportDialog: () => setExportDialogOpen(true),
    setExportFormat,
    setExportResolution
  };
}
