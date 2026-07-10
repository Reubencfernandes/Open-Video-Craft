/**
 * Media helpers: project recording -> media items, video thumbnail capture,
 * waveform blob loading with mime inference, and 16 kHz mono decoding for
 * speech-to-text.
 */
import type WaveSurfer from "wavesurfer.js";
import type { ImportedMediaFile, ProjectView } from "../../shared/types";
import type { EditorMediaItem } from "./types";
import { clampNumber } from "./utils";

export function createProjectMedia(project: ProjectView | null): EditorMediaItem[] {
  if (!project) {
    return [];
  }

  const items: EditorMediaItem[] = [];
  const duration = (project.durationMs ?? 0) / 1000 || null;

  if (project.mediaUrls.screen) {
    items.push({
      id: `${project.id}:screen`,
      name: "screen.webm",
      url: project.mediaUrls.screen,
      kind: "video",
      origin: "project",
      track: "screen",
      duration
    });
  }

  if (project.mediaUrls.camera) {
    items.push({
      id: `${project.id}:camera`,
      name: "camera.webm",
      url: project.mediaUrls.camera,
      kind: "video",
      origin: "project",
      track: "camera",
      duration
    });
  }

  const audioUrl = project.mediaUrls.micWav ?? project.mediaUrls.micWebm;
  if (audioUrl) {
    items.push({
      id: `${project.id}:audio`,
      name: project.mediaUrls.micWav ? "mic.wav" : "mic.webm",
      url: audioUrl,
      kind: "audio",
      origin: "project",
      track: "audio",
      duration
    });
  }

  const systemAudioUrl = project.mediaUrls.systemWav ?? project.mediaUrls.systemWebm;
  if (systemAudioUrl) {
    items.push({
      id: `${project.id}:system-audio`,
      name: project.mediaUrls.systemWav ? "system.wav" : "system.webm",
      url: systemAudioUrl,
      kind: "audio",
      origin: "project",
      track: "audio",
      duration
    });
  }

  return items;
}

export function toEditorMediaItem(file: ImportedMediaFile): EditorMediaItem {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    kind: file.kind,
    origin: "imported",
    track: "imported",
    duration: null,
    importId: file.id,
    extension: file.extension
  };
}

export function canDriftSeek(element: HTMLMediaElement): boolean {
  return !element.seeking && element.readyState >= HTMLMediaElement.HAVE_METADATA;
}

export async function captureVideoThumbnail(
  url: string,
  onDuration: (duration: number) => void
): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  // Both ovc-media and ovc-import responses carry Access-Control-Allow-Origin,
  // but a media element only stays origin-clean (so the frame can be read back
  // with canvas.toDataURL) when it opts into CORS. Without this the capture
  // throws a SecurityError on the drawn frame and every thumbnail silently
  // falls back to the placeholder icon.
  video.crossOrigin = "anonymous";
  video.src = url;
  video.load();

  try {
    const duration = await resolveVideoDuration(video);
    if (Number.isFinite(duration) && duration > 0) {
      onDuration(duration);
    }

    const seekTo =
      Number.isFinite(duration) && duration > 0
        ? clampNumber(duration * 0.1, 0.1, Math.max(0, duration - 0.05))
        : 0.1;
    await seekVideoTo(video, seekTo);

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error("Video has no decodable frames.");
    }

    const scale = Math.min(1, 320 / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Video failed to load."));
    video.addEventListener("error", fail, { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(video.duration)) {
          resolve(video.duration);
          return;
        }

        // Chunked WebM reports Infinity until forced to scan to the end.
        const onDurationChange = () => {
          if (Number.isFinite(video.duration)) {
            video.removeEventListener("durationchange", onDurationChange);
            resolve(video.duration);
          }
        };
        video.addEventListener("durationchange", onDurationChange);
        try {
          video.currentTime = 1e9;
        } catch {
          resolve(Number.NaN);
        }
      },
      { once: true }
    );
  });
}

function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("Video failed while seeking.")),
      { once: true }
    );

    try {
      video.currentTime = time;
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function loadWaveSurferBlob(
  wavesurfer: WaveSurfer,
  url: string,
  name: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Waveform audio fetch failed: ${response.status}`);
  }

  const sourceBlob = await response.blob();
  const mimeType = sourceBlob.type || inferAudioMimeType(name);
  const audioBlob = mimeType
    ? new Blob([await sourceBlob.arrayBuffer()], { type: mimeType })
    : sourceBlob;

  await wavesurfer.loadBlob(audioBlob);
}

function inferAudioMimeType(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "aac":
      return "audio/aac";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "oga":
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    default:
      return "";
  }
}

// Decode any audio/video URL to a mono 16kHz Float32Array, which is what the
// Whisper speech-to-text model expects.
export async function decodeAudioTo16kMono(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const length = decoded.length;
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / channels;
      }
    }

    const targetRate = 16000;
    if (decoded.sampleRate === targetRate) {
      return mono;
    }

    const offline = new OfflineAudioContext(
      1,
      Math.ceil((length * targetRate) / decoded.sampleRate),
      targetRate
    );
    const buffer = offline.createBuffer(1, length, decoded.sampleRate);
    buffer.copyToChannel(mono, 0);
    const bufferSource = offline.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.connect(offline.destination);
    bufferSource.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void audioContext.close();
  }
}
