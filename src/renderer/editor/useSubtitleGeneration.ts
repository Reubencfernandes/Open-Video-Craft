/**
 * Speech-to-text orchestration for the Subtitles tool.
 *
 * Three providers: on-device Whisper (transformers.js worker), Cohere
 * Transcribe, and Gemini — the cloud providers run in the main process via
 * the stt IPC namespace so API keys never enter the renderer. All providers
 * transcribe a MIX of every audible speech source on the timeline (camera +
 * screen + mic together), placed at timeline positions so subtitle timestamps
 * are timeline-accurate.
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ProviderKeysView,
  SttProviderId,
  SttTranscribeSource,
  UpdateProviderKeysRequest
} from "../../shared/types";
import { getEffectiveAudioLevel } from "../../shared/editor-domain";
import {
  detectSubtitleActivityRanges,
  type SubtitleActivityRange
} from "../../shared/subtitle-activity";
import { decodeTimelineAudioMix } from "./media-utils";
import {
  createSubtitleSegmentsFromWhisperOutput,
  getWhisperOutputLanguage,
} from "./subtitle-transcription";
import { transcribeAudioInWorker } from "./subtitle-transcription-client";
import { clampSubtitleSegmentsToDuration } from "./subtitle-time";
import { formatSpeechToTextError } from "./stt-errors";
import type { SubtitleSegment, TimelineMediaClip } from "./types";

type AudioLevelState = Record<string, { volume: number; muted: boolean }>;

export type SttStatus = "idle" | "loading" | "transcribing" | "done" | "error";

type UseSubtitleGenerationParams = {
  audioClips: TimelineMediaClip[];
  videoClips: TimelineMediaClip[];
  audioLevels: AudioLevelState;
  backgroundAudioIds: string[];
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedSubtitleId: Dispatch<SetStateAction<string | null>>;
  setSubtitleLanguage: Dispatch<SetStateAction<string | null>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleSegment[]>>;
};

type SpeechSource = SttTranscribeSource;

/**
 * Every non-muted clip that can carry speech, camera and screen included.
 * Background music is excluded (it would pollute the transcript) unless it is
 * the only audio in the project.
 */
export function collectSpeechSources(params: {
  audioClips: TimelineMediaClip[];
  videoClips: TimelineMediaClip[];
  audioLevels: AudioLevelState;
  backgroundAudioIds: string[];
}): SpeechSource[] {
  const toSource = (clip: TimelineMediaClip): SpeechSource => ({
    url: clip.item.url,
    sourceStart: Math.max(0, clip.sourceStart),
    duration: Math.max(0.01, clip.duration),
    timelineOffset: Math.max(0, clip.start),
    // audioLevels volume is on the editor's 0–100 scale; the mixers expect
    // linear gain.
    gain: getEffectiveAudioLevel(
      params.audioLevels,
      clip.item.id,
      clip.track === "audio" ? clip.lane : null
    ).volume / 100
  });

  const audible = (clip: TimelineMediaClip): boolean =>
    !getEffectiveAudioLevel(
      params.audioLevels,
      clip.item.id,
      clip.track === "audio" ? clip.lane : null
    ).muted && clip.item.kind !== "image";

  const isBackgroundMusic = (clip: TimelineMediaClip): boolean =>
    params.backgroundAudioIds.includes(clip.item.id) ||
    (clip.item.importId !== undefined && params.backgroundAudioIds.includes(clip.item.importId));

  const clips = [...params.videoClips, ...params.audioClips].filter(audible);
  const speech = clips.filter((clip) => !isBackgroundMusic(clip));
  return (speech.length > 0 ? speech : clips).map(toSource);
}

export function useSubtitleGeneration(params: UseSubtitleGenerationParams) {
  const {
    audioClips,
    videoClips,
    audioLevels,
    backgroundAudioIds,
    setError,
    setSelectedSubtitleId,
    setSubtitleLanguage,
    setSubtitles
  } = params;

  const [sttStatus, setSttStatus] = useState<SttStatus>("idle");
  const [sttDownloadProgress, setSttDownloadProgress] = useState<number | null>(null);
  const [sttActivityRanges, setSttActivityRanges] = useState<SubtitleActivityRange[]>([]);
  const [providerKeys, setProviderKeys] = useState<ProviderKeysView | null>(null);
  const activeCloudRequestId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.openVideoCraft.providers
      .get()
      .then((view) => {
        if (!cancelled) setProviderKeys(view);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const sttProvider: SttProviderId = providerKeys?.sttProvider ?? "whisper-local";

  async function updateProviderSettings(request: UpdateProviderKeysRequest) {
    try {
      setProviderKeys(await window.openVideoCraft.providers.update(request));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshProviderKeys() {
    try {
      setProviderKeys(await window.openVideoCraft.providers.get());
    } catch {
      // Keep the stale view; the panel remains usable.
    }
  }

  async function generateSubtitles() {
    const sources = collectSpeechSources({
      audioClips,
      videoClips,
      audioLevels,
      backgroundAudioIds
    });

    if (sources.length === 0) {
      setError("Add audio or a video with speech before generating subtitles.");
      return;
    }

    // A fresh transcription replaces the previous subtitle track. Clear it
    // before showing speech-position placeholders so old and pending clips
    // are never layered together.
    setSubtitles([]);
    setSelectedSubtitleId(null);
    setSubtitleLanguage(null);
    setSttActivityRanges([]);
    setError(null);
    setSttStatus("loading");

    try {
      if (sttProvider === "whisper-local") {
        // Let React paint the same timeline processing indicator used by cloud
        // providers before local decoding/model setup starts doing heavier work.
        await yieldForSubtitleStatusPaint();
        await generateWithWhisper(sources);
      } else {
        await generateWithCloud(sttProvider, sources);
      }
      setSttStatus("done");
    } catch (sttError) {
      setSttDownloadProgress(null);
      setSttActivityRanges([]);
      setError(formatSpeechToTextError(sttError, sttProvider));
      setSttStatus("error");
    }
  }

  async function generateWithWhisper(sources: SpeechSource[]) {
    const audio = await decodeTimelineAudioMix(sources);
    setSttActivityRanges(detectSubtitleActivityRanges(audio));
    const output = await transcribeAudioInWorker({
      audio,
      wasmBaseUrl: new URL(".", document.baseURI).href,
      onProgress: (progress) => {
        setSttDownloadProgress(progress);
      },
      onTranscribing: () => {
        setSttDownloadProgress(null);
        setSttStatus("transcribing");
      }
    });

    const segments = createSubtitleSegmentsFromWhisperOutput(output);
    applySegments(segments, getWhisperOutputLanguage(output), getSpeechTimelineDuration(sources));
  }

  async function generateWithCloud(provider: "cohere" | "gemini", sources: SpeechSource[]) {
    const requestId = crypto.randomUUID();
    activeCloudRequestId.current = requestId;

    const unsubscribe = window.openVideoCraft.stt.onProgress((event) => {
      if (event.requestId !== requestId) return;
      if (event.activityRanges) setSttActivityRanges(event.activityRanges);
      if (event.phase === "transcribing") {
        setSttDownloadProgress(null);
        setSttStatus("transcribing");
      } else {
        setSttStatus("loading");
        setSttDownloadProgress(event.percent);
      }
    });

    try {
      const result = await window.openVideoCraft.stt.transcribe({
        requestId,
        provider,
        sources
      });
      applySegments(result.segments, result.language, getSpeechTimelineDuration(sources));
    } finally {
      unsubscribe();
      setSttDownloadProgress(null);
      if (activeCloudRequestId.current === requestId) {
        activeCloudRequestId.current = null;
      }
    }
  }

  function applySegments(
    segments: SubtitleSegment[],
    language: string | null,
    timelineDuration: number
  ) {
    const boundedSegments = clampSubtitleSegmentsToDuration(segments, timelineDuration);
    if (boundedSegments.length > 0) {
      setSttActivityRanges([]);
      setSubtitleLanguage(language);
      setSubtitles(boundedSegments);
      setSelectedSubtitleId(boundedSegments[0].id);
    } else {
      setSttActivityRanges([]);
      setSubtitleLanguage(null);
      setError("No speech was detected in the audio.");
    }
  }

  function cancelTranscription() {
    const requestId = activeCloudRequestId.current;
    if (requestId) {
      void window.openVideoCraft.stt.cancel(requestId);
    }
  }

  return {
    cancelTranscription,
    generateSubtitles,
    providerKeys,
    refreshProviderKeys,
    sttDownloadProgress,
    sttProvider,
    sttStatus,
    sttActivityRanges,
    updateProviderSettings
  };
}

function getSpeechTimelineDuration(sources: SpeechSource[]): number {
  return Math.max(0, ...sources.map((source) => source.timelineOffset + source.duration));
}

function yieldForSubtitleStatusPaint(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
