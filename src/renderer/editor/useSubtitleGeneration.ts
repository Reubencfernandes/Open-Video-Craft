/**
 * On-device speech-to-text (Whisper via transformers.js).
 *
 * The model is imported lazily and only when the user asks for a transcription,
 * so the download/compute never happens automatically and a failure never
 * affects the rest of the editor. This hook owns the transcription status state
 * (`sttStatus`) shown in the Subtitles panel.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { decodeAudioTo16kMono } from "./media-utils";
import {
  addLanguageToWhisperWordChunks,
  createSubtitleSegmentsFromWhisperOutput,
  getWhisperOutputLanguage,
  whisperTranscriptionModel
} from "./subtitle-transcription";
import type { WhisperTranscriptionOutput } from "./subtitle-transcription";
import type { EditorMediaItem, SubtitleSegment } from "./types";

export type SttStatus = "idle" | "loading" | "transcribing" | "done" | "error";

type Transcriber = (input: Float32Array, options: Record<string, unknown>) => Promise<WhisperTranscriptionOutput>;
let cachedTranscriber: Promise<Transcriber> | null = null;

type ModelDownloadProgress = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

/**
 * transformers.js fires a progress event per model file, each with its own
 * loaded/total bytes. Summing bytes across files gives one honest percentage;
 * a monotonic guard keeps it from visibly dropping when a new file's totals
 * join the sum mid-download.
 */
function createDownloadProgressReporter(onProgress: (value: number) => void) {
  const bytesByFile = new Map<string, { loaded: number; total: number }>();
  let lastShown = 0;

  return (event: unknown) => {
    if (!event || typeof event !== "object") {
      return;
    }

    const { status, file, loaded, total } = event as ModelDownloadProgress;
    if (!file) {
      return;
    }

    if (status === "progress" && typeof loaded === "number" && typeof total === "number" && total > 0) {
      bytesByFile.set(file, { loaded, total });
    } else if (status === "done") {
      const entry = bytesByFile.get(file);
      if (entry) {
        bytesByFile.set(file, { loaded: entry.total, total: entry.total });
      }
    } else {
      return;
    }

    let loadedBytes = 0;
    let totalBytes = 0;
    for (const entry of bytesByFile.values()) {
      loadedBytes += entry.loaded;
      totalBytes += entry.total;
    }
    if (totalBytes <= 0) {
      return;
    }

    const percentage = Math.max(0, Math.min(100, (loadedBytes / totalBytes) * 100));
    lastShown = Math.max(lastShown, percentage);
    onProgress(lastShown);
  };
}

type UseSubtitleGenerationParams = {
  allMedia: EditorMediaItem[];
  audioSources: EditorMediaItem[];
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
};

export function useSubtitleGeneration(params: UseSubtitleGenerationParams) {
  const {
    allMedia,
    audioSources,
    setError,
    setSelectedSubtitleId,
    setSubtitleLanguage,
    setSubtitles
  } = params;

  const [sttStatus, setSttStatus] = useState<SttStatus>("idle");
  const [sttDownloadProgress, setSttDownloadProgress] = useState<number | null>(null);

  async function generateSubtitles() {
    // Prefer a dedicated audio source (mic/music); fall back to a video's own
    // audio track when no standalone audio exists.
    const source =
      audioSources[0] ?? allMedia.find((item) => item.kind === "video") ?? null;
    if (!source) {
      setError("Add audio or a video with speech before generating subtitles.");
      return;
    }

    setError(null);
    setSttStatus("loading");

    try {
      const transformers = await import("@huggingface/transformers");
      transformers.env.allowLocalModels = false;
      // The ONNX wasm runtime is bundled next to index.html (see vite.config.ts).
      // Without this, transformers.js fetches it from the jsdelivr CDN, which the
      // renderer CSP blocks -> "no available backend". Point it at our origin and
      // stay single-threaded (file:// isn't cross-origin isolated for SAB).
      const wasmBackend = transformers.env.backends?.onnx?.wasm;
      if (wasmBackend) {
        wasmBackend.wasmPaths = new URL(".", document.baseURI).href;
        wasmBackend.numThreads = 1;
      }

      const audio = await decodeAudioTo16kMono(source.url);
      cachedTranscriber ??= transformers.pipeline(
        "automatic-speech-recognition",
        whisperTranscriptionModel,
        {
          // The model downloads as several files, each reporting its own 0-100%.
          // Track bytes across files for one true percentage, and never let the
          // shown value drop (new files joining would otherwise make it jump back).
          progress_callback: createDownloadProgressReporter(setSttDownloadProgress)
        }
      ).then((pipeline) => {
        const transcriber = pipeline as unknown as Transcriber;
        addLanguageToWhisperWordChunks(transcriber);
        return transcriber;
      }).catch((error) => {
        cachedTranscriber = null;
        throw error;
      });
      const transcriber = await cachedTranscriber;
      setSttDownloadProgress(null);
      setSttStatus("transcribing");

      const output = await transcriber(audio, {
        return_timestamps: "word",
        chunk_length_s: 30,
        stride_length_s: 5
      });

      const segments = createSubtitleSegmentsFromWhisperOutput(output);

      if (segments.length > 0) {
        setSubtitleLanguage(getWhisperOutputLanguage(output));
        setSubtitles(segments);
        setSelectedSubtitleId(segments[0].id);
      } else {
        setSubtitleLanguage(null);
        setError("No speech was detected in the audio.");
      }
      setSttStatus("done");
    } catch (sttError) {
      setSttDownloadProgress(null);
      const message = sttError instanceof Error ? sttError.message : String(sttError);
      setError(`Speech-to-text failed: ${message}`);
      setSttStatus("error");
    }
  }

  return {
    generateSubtitles,
    sttDownloadProgress,
    sttStatus
  };
}
