/** Microphone dictation for the AI composer using the local Whisper worker. */
import { useCallback, useEffect, useRef, useState } from "react";
import { resampleMonoTo16k } from "./audio-resample";
import { transcribeAudioInWorker } from "./subtitle-transcription-client";

export function useAssistantVoiceInput(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
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

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (recording || transcribing) return;
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        stopStreams();
        void (async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          setTranscribing(true);
          try {
            if (blob.size === 0) throw new Error("No audio was recorded.");
            const context = new window.AudioContext();
            const decoded = await context.decodeAudioData(await blob.arrayBuffer());
            const audio = resampleMonoTo16k(decoded);
            await context.close().catch(() => undefined);
            const output = await transcribeAudioInWorker({
              audio,
              wasmBaseUrl: new URL(".", document.baseURI).href,
              onProgress: () => undefined,
              onTranscribing: () => undefined
            });
            const text = output.text?.trim() ||
              output.chunks?.map((chunk) => chunk.text).join(" ").trim() ||
              "";
            if (text) onTranscript(text);
            else setError("No speech was detected.");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setTranscribing(false);
          }
        })();
      };
      recorder.start();
      setRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setRecording(false);
      stopStreams();
    }
  }, [onTranscript, recording, stopStreams, transcribing]);

  return { error, recording, start, stop, transcribing };
}
