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
  createSubtitleSegmentsFromWhisperOutput,
  getWhisperOutputLanguage,
} from "./subtitle-transcription";
import { transcribeAudioInWorker } from "./subtitle-transcription-client";
import type { EditorMediaItem, SubtitleSegment } from "./types";

export type SttStatus = "idle" | "loading" | "transcribing" | "done" | "error";

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
      const audio = await decodeAudioTo16kMono(source.url);
      const output = await transcribeAudioInWorker({
        audio,
        wasmBaseUrl: new URL(".", document.baseURI).href,
        onProgress: setSttDownloadProgress,
        onTranscribing: () => {
          setSttDownloadProgress(null);
          setSttStatus("transcribing");
        }
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
