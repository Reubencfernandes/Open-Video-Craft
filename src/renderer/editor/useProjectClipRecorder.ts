/** Record microphone/camera clips into the current project without stopping preview. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportedMediaFile } from "../../shared/types";

export type ProjectRecordKind = "audio" | "video";

export function useProjectClipRecorder(params: {
  projectId: string | null;
  onImported: (files: ImportedMediaFile[]) => void;
}) {
  const [kind, setKind] = useState<ProjectRecordKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopStreams();
  }, [stopStreams]);

  const start = useCallback(async (nextKind: ProjectRecordKind) => {
    const projectId = params.projectId;
    if (kind || !projectId) return;
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone or camera recording is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: nextKind === "video"
      });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setKind(null);
        stopStreams();
        void (async () => {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            if (blob.size === 0) throw new Error("No media was recorded.");
            const requestId = crypto.randomUUID();
            const files = await window.openVideoCraft.editor.importRecordedClip({
              projectId,
              requestId,
              name: `recorded-${nextKind}-${requestId}.webm`,
              data: await blob.arrayBuffer()
            });
            params.onImported(files);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        })();
      };
      recorder.start();
      setKind(nextKind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setKind(null);
      stopStreams();
    }
  }, [kind, params, stopStreams]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setKind(null);
  }, []);

  return { error, kind, start, stop };
}
