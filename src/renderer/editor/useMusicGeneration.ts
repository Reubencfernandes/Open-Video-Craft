/**
 * State for Lyria music generation and handing finished tracks to the media
 * ingest flow, which drops them on an audio lane as background music.
 */
import { useRef, useState } from "react";
import type {
  MusicEngine,
  MusicGenerateProgressEvent,
  MusicGenerateResult
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
  const [generationState, setGenerationState] = useState<MusicGenerationState>("idle");
  const [progress, setProgress] = useState<MusicGenerateProgressEvent | null>(null);
  const [lastLyrics, setLastLyrics] = useState<string | null>(null);
  const activeJobId = useRef<string | null>(null);

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
    lastLyrics,
    progress
  };
}
