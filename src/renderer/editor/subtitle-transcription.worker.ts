/** Dedicated worker that owns the Whisper model and CPU/GPU inference. */
import * as transformers from "@huggingface/transformers";
import {
  addLanguageToWhisperWordChunks,
  createWhisperTranscriptionOptions,
  isMissingWhisperAttentionError,
  whisperTranscriptionModel
} from "./subtitle-transcription";
import type { WhisperTranscriptionOutput } from "./subtitle-transcription";

type Transcriber = (
  input: Float32Array,
  options: Record<string, unknown>
) => Promise<WhisperTranscriptionOutput>;

type WorkerRequest = {
  id: string;
  audio: Float32Array;
  wasmBaseUrl: string;
};

type ModelDownloadProgress = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

let cachedTranscriber: Promise<Transcriber> | null = null;
let reportModelProgress: (value: number) => void = () => undefined;

transformers.env.allowLocalModels = false;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void transcribe(event.data);
};

async function transcribe(request: WorkerRequest): Promise<void> {
  try {
    const wasmBackend = transformers.env.backends?.onnx?.wasm;
    if (wasmBackend) {
      wasmBackend.wasmPaths = request.wasmBaseUrl;
      wasmBackend.numThreads = 1;
    }
    reportModelProgress = (value) => post(request.id, { type: "progress", value });
    cachedTranscriber ??= createTranscriber().catch((error) => {
      cachedTranscriber = null;
      throw error;
    });
    const transcriber = await cachedTranscriber;
    post(request.id, { type: "transcribing" });

    let output: WhisperTranscriptionOutput;
    try {
      output = await transcriber(
        request.audio,
        createWhisperTranscriptionOptions("word")
      );
    } catch (timestampError) {
      if (!isMissingWhisperAttentionError(timestampError)) throw timestampError;
      output = await transcriber(
        request.audio,
        createWhisperTranscriptionOptions(true)
      );
    }
    post(request.id, { type: "result", output });
  } catch (error) {
    post(request.id, {
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function createTranscriber(): Promise<Transcriber> {
  const progress_callback = createDownloadProgressReporter((value) => reportModelProgress(value));
  const hasWebGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  if (hasWebGpu) {
    try {
      return await loadTranscriber({ device: "webgpu", progress_callback });
    } catch {
      // Unsupported adapters/operators fall back to the bundled WASM backend.
    }
  }
  return loadTranscriber({ device: "wasm", progress_callback });
}

async function loadTranscriber(options: Record<string, unknown>): Promise<Transcriber> {
  const pipeline = await transformers.pipeline(
    "automatic-speech-recognition",
    whisperTranscriptionModel,
    options
  );
  const transcriber = pipeline as unknown as Transcriber;
  addLanguageToWhisperWordChunks(transcriber);
  return transcriber;
}

function createDownloadProgressReporter(onProgress: (value: number) => void) {
  const bytesByFile = new Map<string, { loaded: number; total: number }>();
  let lastShown = 0;
  return (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const { status, file, loaded, total } = event as ModelDownloadProgress;
    if (!file) return;
    if (status === "progress" && typeof loaded === "number" && typeof total === "number" && total > 0) {
      bytesByFile.set(file, { loaded, total });
    } else if (status === "done") {
      const entry = bytesByFile.get(file);
      if (entry) bytesByFile.set(file, { loaded: entry.total, total: entry.total });
    } else {
      return;
    }
    const values = [...bytesByFile.values()];
    const totalBytes = values.reduce((sum, entry) => sum + entry.total, 0);
    if (totalBytes <= 0) return;
    const loadedBytes = values.reduce((sum, entry) => sum + entry.loaded, 0);
    lastShown = Math.max(lastShown, Math.max(0, Math.min(100, loadedBytes / totalBytes * 100)));
    onProgress(lastShown);
  };
}

function post(id: string, message: Record<string, unknown>): void {
  self.postMessage({ id, ...message });
}
