/**
 * Webcam background removal from the editor's side (S9).
 *
 * The heavy pass happens once in main; the editor asks for it, shows real
 * progress, and hands the generated mask to the preview compositor.
 */
import { useCallback, useEffect, useState } from "react";
import type { BackgroundRemovalStatus } from "../../shared/types";

const idle: BackgroundRemovalStatus = { status: "idle", progress: 0, message: null };

export function useCameraBackground(projectId: string | null) {
  const [status, setStatus] = useState<BackgroundRemovalStatus>(idle);
  const [matteUrl, setMatteUrl] = useState<string | null>(null);

  const refreshMatte = useCallback(async () => {
    if (projectId === null) {
      setMatteUrl(null);
      return;
    }
    setMatteUrl(await window.openVideoCraft.background.matteUrl(projectId).catch(() => null));
  }, [projectId]);

  useEffect(() => {
    void refreshMatte();
    if (projectId === null) {
      setStatus(idle);
      return undefined;
    }
    void window.openVideoCraft.background.status(projectId).then(setStatus).catch(() => undefined);
    return window.openVideoCraft.background.onProgress((next) => {
      setStatus(next);
      if (next.status === "done") void refreshMatte();
    });
  }, [projectId, refreshMatte]);

  const prepare = useCallback(async () => {
    if (projectId === null) return;
    setStatus({ status: "downloading-model", progress: 0, message: "Preparing the background model." });
    const next = await window.openVideoCraft.background.prepare(projectId).catch((error: unknown) => ({
      status: "error" as const,
      progress: 0,
      message: error instanceof Error ? error.message : String(error)
    }));
    setStatus(next);
    if (next.status === "done") void refreshMatte();
  }, [projectId, refreshMatte]);

  const cancel = useCallback(async () => {
    if (projectId === null) return;
    await window.openVideoCraft.background.cancel(projectId).catch(() => undefined);
  }, [projectId]);

  return { status, matteUrl, prepare, cancel, refreshMatte };
}
