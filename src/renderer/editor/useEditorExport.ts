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
import type { TextOverlay } from "../../shared/editor-domain";
import type { EditorMediaItem, TimelineSegment } from "./types";
import type { SubtitleSegment } from "./types";
import { formatBytes } from "./utils";

type UseEditorExportParams = {
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  backgroundAudioIds: string[];
  masterVolume: number;
  project: ProjectView | null;
  projectScreen: EditorMediaItem | null;
  hasVideoTimeline: boolean;
  selectedItem: EditorMediaItem | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setExportMessage: Dispatch<SetStateAction<string | null>>;
  subtitles: SubtitleSegment[];
  textOverlays: TextOverlay[];
  timelineSegments: TimelineSegment[];
  trimRange: { start: number; end: number };
  beforeExport: () => Promise<ProjectView | null>;
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
    textOverlays,
    timelineSegments,
    trimRange
  } = params;
  const [exportFormat, setExportFormat] = useState<ExportVideoFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [exportSubtitleMode, setExportSubtitleMode] = useState<ExportSubtitleMode>("burn-in");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const activeExportJobIdRef = useRef<string | null>(null);
  const cancelledExportJobIdRef = useRef<string | null>(null);

  useEffect(() => window.openVideoCraft.editor.onExportProgress((progress) => {
    if (progress.jobId === activeExportJobIdRef.current) setExportProgress(progress);
  }), []);

  function getExportSource(savedProject = project): ExportVideoRequest["source"] | null {
    // A project whose timeline holds video must render through the compositor:
    // it is the only path that lays out every clip. This outranks the selected
    // clip below, which renders that one file alone — with a clip selected, an
    // edit built from several imports silently exported just the selected one.
    if (savedProject && params.hasVideoTimeline) {
      return { kind: "project", projectId: savedProject.id };
    }

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
    if (activeExportJobIdRef.current) return;
    const source = getExportSource();

    if (!source && !params.hasVideoTimeline) {
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
      const savedProject = await params.beforeExport();
      const savedSource = getExportSource(savedProject);
      if (!savedSource) throw new Error("Add a video clip to the timeline before exporting.");
      if (cancelledExportJobIdRef.current === jobId) return;
      const result = await window.openVideoCraft.editor.exportVideo({
        jobId,
        source: savedSource,
        format: exportFormat,
        resolution: exportResolution,
        trimStart: savedSource.kind === "import" ? 0 : trimRange.start,
        trimEnd: savedSource.kind === "import" ? null : trimRange.end > trimRange.start ? trimRange.end : null,
        volume: masterVolume / 100,
        audioLevels,
        backgroundAudioImportIds: backgroundAudioIds,
        subtitles: subtitles.map(({ start, end, text }) => ({ start, end, text })),
        subtitleMode: exportSubtitleMode,
        // The project export path reads overlays from the saved document; the
        // import path has no document, so they travel with the request.
        textOverlays
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
    cancelledExportJobIdRef.current = jobId;
    setExportProgress((current) => current ? { ...current, message: "Cancelling export…" } : current);
    await window.openVideoCraft.editor.cancelExport(jobId);
  }

  return {
    canExport: params.hasVideoTimeline || Boolean(getExportSource()),
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
