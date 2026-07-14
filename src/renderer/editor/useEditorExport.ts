/**
 * Export dialog state and the renderer side of export requests.
 */
import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  SetStateAction
} from "react";
import type {
  ExportResolution,
  ExportProgress,
  ExportSubtitleMode,
  ExportVideoFormat,
  ExportVideoRequest,
  ProjectView
} from "../../shared/types";
import type { EditorMediaItem } from "./types";
import type { SubtitleSegment } from "./types";
import { formatBytes } from "./utils";

type UseEditorExportParams = {
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  backgroundAudioIds: string[];
  masterVolume: number;
  project: ProjectView | null;
  projectScreen: EditorMediaItem | null;
  selectedItem: EditorMediaItem | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  subtitles: SubtitleSegment[];
  trimRange: { start: number; end: number };
  beforeExport: () => Promise<void>;
};

export function useEditorExport(params: UseEditorExportParams) {
  const {
    audioLevels,
    backgroundAudioIds,
    masterVolume,
    project,
    projectScreen,
    selectedItem,
    setError,
    setExportMessage,
    subtitles,
    trimRange
  } = params;
  const [exportFormat, setExportFormat] = useState<ExportVideoFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [exportSubtitleMode, setExportSubtitleMode] = useState<ExportSubtitleMode>("burn-in");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const activeExportJobIdRef = useRef<string | null>(null);

  useEffect(() => window.openVideoCraft.editor.onExportProgress((progress) => {
    if (progress.jobId === activeExportJobIdRef.current) setExportProgress(progress);
  }), []);

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
    const jobId = crypto.randomUUID();
    activeExportJobIdRef.current = jobId;
    setExportProgress({ jobId, percent: 0, message: "Preparing export…" });

    try {
      await params.beforeExport();
      const result = await window.openVideoCraft.editor.exportVideo({
        jobId,
        source,
        format: exportFormat,
        resolution: exportResolution,
        trimStart: trimRange.start,
        trimEnd: trimRange.end > trimRange.start ? trimRange.end : null,
        volume: masterVolume / 100,
        audioLevels,
        backgroundAudioImportIds: backgroundAudioIds,
        subtitles: subtitles.map(({ start, end, text }) => ({ start, end, text })),
        subtitleMode: exportSubtitleMode
      });

      if (result) {
        setExportMessage(`Exported ${formatBytes(result.bytesWritten)} to ${result.path}${result.subtitlePath ? ` with subtitles at ${result.subtitlePath}` : ""}`);
        setExportDialogOpen(false);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
      activeExportJobIdRef.current = null;
      setExportProgress(null);
    }
  }

  async function cancelExport() {
    const jobId = activeExportJobIdRef.current;
    if (!jobId) return;
    setExportProgress((current) => current ? { ...current, message: "Cancelling export…" } : current);
    await window.openVideoCraft.editor.cancelExport(jobId);
  }

  return {
    canExport: Boolean(getExportSource()),
    cancelExport,
    closeExportDialog,
    exportCurrentVideo,
    exportDialogOpen,
    exportFormat,
    exportProgress,
    exporting,
    exportResolution,
    exportSubtitleMode,
    hasSubtitles: subtitles.length > 0,
    openExportDialog: () => setExportDialogOpen(true),
    setExportFormat,
    setExportResolution,
    setExportSubtitleMode
  };
}
