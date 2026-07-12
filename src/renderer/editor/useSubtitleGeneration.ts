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

      const audio = await decodeAudioTo16kMono(source.url);
      cachedTranscriber ??= transformers.pipeline(
        "automatic-speech-recognition",
        whisperTranscriptionModel,
        {
          progress_callback: (progress: unknown) => {
            const percentage = progress && typeof progress === "object"
              ? (progress as { progress?: unknown }).progress
              : null;
            if (typeof percentage === "number") {
              setSttDownloadProgress(Math.max(0, Math.min(100, percentage)));
            }
          }
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
