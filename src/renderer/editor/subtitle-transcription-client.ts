/** Browser-side client for the dedicated Whisper transcription worker. */
import type { WhisperTranscriptionOutput } from "./subtitle-transcription";

type WorkerResponse =
  | { id: string; type: "progress"; value: number }
  | { id: string; type: "transcribing" }
  | { id: string; type: "result"; output: WhisperTranscriptionOutput }
  | { id: string; type: "error"; message: string };

type PendingRequest = {
  resolve: (output: WhisperTranscriptionOutput) => void;
  reject: (error: Error) => void;
  onProgress: (value: number) => void;
  onTranscribing: () => void;
};

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./subtitle-transcription.worker.ts", import.meta.url), {
    type: "module",
    name: "open-video-craft-whisper"
  });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    if (event.data.type === "progress") request.onProgress(event.data.value);
    if (event.data.type === "transcribing") request.onTranscribing();
    if (event.data.type === "result") {
      pending.delete(event.data.id);
      request.resolve(event.data.output);
    }
    if (event.data.type === "error") {
      pending.delete(event.data.id);
      request.reject(new Error(event.data.message));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "The transcription worker stopped unexpectedly.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function transcribeAudioInWorker(input: {
  audio: Float32Array;
  wasmBaseUrl: string;
  onProgress: (value: number) => void;
  onTranscribing: () => void;
}): Promise<WhisperTranscriptionOutput> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      onProgress: input.onProgress,
      onTranscribing: input.onTranscribing
    });
    getWorker().postMessage(
      { id, audio: input.audio, wasmBaseUrl: input.wasmBaseUrl },
      [input.audio.buffer]
    );
  });
}
