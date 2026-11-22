/** Microphone dictation for the AI composer using main-process Whisper. */
import { useCallback, useEffect, useRef, useState } from "react";

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
          setTranscribing(true);
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            if (blob.size === 0) throw new Error("No audio was recorded.");
            const result = await window.openVideoCraft.audio.transcribeMic({
              requestId: crypto.randomUUID(),
              audio: await blob.arrayBuffer()
            });
            if (result.text) onTranscript(result.text);
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
