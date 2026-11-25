/**
 * Recording from inside a project (S1 follow-up).
 *
 * The editor's record buttons open the same recorder the app uses outside a
 * project — source grid, multiple monitors and cameras, quality, microphone and
 * system audio — instead of capturing straight from the renderer. Nothing is
 * added to the current timeline: the recording becomes its own project, and the
 * owner decides later whether to bring it in.
 */
import { useCallback, useState } from "react";
import type { ImportedMediaFile } from "../../shared/types";

export type ProjectRecordKind = "audio" | "video";

export function useProjectClipRecorder(_params: {
  projectId: string | null;
  onImported: (files: ImportedMediaFile[]) => void;
}) {
  const [kind] = useState<ProjectRecordKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (_nextKind: ProjectRecordKind) => {
    setError(null);
    try {
      const opened = await window.openVideoCraft.windows.openRecorderController();
      if (!opened) setError("The recorder window could not be opened.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  // The standalone recorder owns its own stop and cancel controls.
  const stop = useCallback(() => undefined, []);

  return { error, kind, start, stop };
}
