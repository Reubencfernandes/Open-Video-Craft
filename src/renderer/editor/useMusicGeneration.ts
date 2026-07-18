/**
 * State for the Music AI tool: ACE-Step local setup/install status, generation
 * progress for all engines, and handing finished tracks to the media ingest
 * flow (which drops them on an audio lane as background music).
 */
import { useEffect, useRef, useState } from "react";
import type {
  MusicEngine,
  MusicGenerateProgressEvent,
  MusicGenerateResult,
  MusicSetupStatus
} from "../../shared/types";

export type MusicGenerationState = "idle" | "generating" | "error";

export type MusicGenerationForm = {
  engine: MusicEngine;
  prompt: string;
  lyrics: string;
  durationSeconds: number;
  inferSteps: number;
  guidanceScale: number;
  seed: number | null;
};

export function useMusicGeneration(params: {
  onGenerated: (result: MusicGenerateResult) => void;
  setError: (message: string | null) => void;
}) {
  const [setupStatus, setSetupStatus] = useState<MusicSetupStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [generationState, setGenerationState] = useState<MusicGenerationState>("idle");
  const [progress, setProgress] = useState<MusicGenerateProgressEvent | null>(null);
  const [lastLyrics, setLastLyrics] = useState<string | null>(null);
  const activeJobId = useRef<string | null>(null);

  async function refreshStatus() {
    try {
      setSetupStatus(await window.openVideoCraft.music.getStatus());
    } catch {
      // Status stays unknown; the panel shows a retry.
    }
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install() {
    if (installing) return;
    setInstalling(true);
    setInstallLog([]);
    const unsubscribe = window.openVideoCraft.music.onSetupProgress((event) => {
      setInstallLog((current) => [...current.slice(-30), event.line]);
    });
    try {
      setSetupStatus(await window.openVideoCraft.music.install());
    } catch (error) {
      params.setError(error instanceof Error ? error.message : String(error));
    } finally {
      unsubscribe();
      setInstalling(false);
      void refreshStatus();
    }
  }

  async function generate(form: MusicGenerationForm) {
    if (generationState === "generating") return;
    const jobId = crypto.randomUUID();
    activeJobId.current = jobId;
    setGenerationState("generating");
    setProgress(null);
    setLastLyrics(null);
    params.setError(null);

    const unsubscribe = window.openVideoCraft.music.onGenerateProgress((event) => {
      if (event.jobId === jobId) setProgress(event);
    });

    try {
      const result = await window.openVideoCraft.music.generate({
        jobId,
        engine: form.engine,
        prompt: form.prompt,
        lyrics: form.lyrics,
        durationSeconds: form.durationSeconds,
        inferSteps: form.inferSteps,
        guidanceScale: form.guidanceScale,
        seed: form.seed
      });
      setLastLyrics(result.lyrics);
      params.onGenerated(result);
      setGenerationState("idle");
      void refreshStatus();
    } catch (error) {
      params.setError(
        `Music generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      setGenerationState("error");
    } finally {
      unsubscribe();
      setProgress(null);
      if (activeJobId.current === jobId) activeJobId.current = null;
    }
  }

  function cancel() {
    const jobId = activeJobId.current;
    if (jobId) {
      void window.openVideoCraft.music.cancel(jobId);
    }
  }

  return {
    cancel,
    generate,
    generationState,
    install,
    installLog,
    installing,
    lastLyrics,
    progress,
    refreshStatus,
    setupStatus
  };
}
