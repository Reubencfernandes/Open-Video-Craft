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

export function toEditorMediaItem(
  file: ImportedMediaFile & { duration?: number | null }
): EditorMediaItem {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    kind: file.kind,
    origin: "imported",
    track: "imported",
    duration: typeof file.duration === "number" && file.duration > 0 ? file.duration : null,
    importId: file.id,
    extension: file.extension
  };
}

export function canDriftSeek(element: HTMLMediaElement): boolean {
  return !element.seeking && element.readyState >= HTMLMediaElement.HAVE_METADATA;
}

export interface VideoPoster {
  dataUrl: string;
  duration: number | null;
}

export interface VideoFilmstrip {
  frames: string[];
  duration: number | null;
}

// Captures a real decoded frame into a small JPEG so the media grid and the
// timeline clips can show an actual thumbnail, and reports the resolved
// duration alongside it. Handles chunked recordings that report an Infinity
// duration, and — critically — never blocks forever: every await is bounded by
// a timeout, so a recording that will not seek still yields whatever frame is
// already decoded instead of leaving the thumbnail stuck on the placeholder.
export async function captureVideoPoster(url: string): Promise<VideoPoster> {
  const filmstrip = await captureVideoFilmstrip(url, 1, 480);
  if (!filmstrip.frames[0]) throw new Error("Video has no decodable frames.");
  return { dataUrl: filmstrip.frames[0], duration: filmstrip.duration };
}

/** Captures distinct frames across the media duration for timeline filmstrips. */
export async function captureVideoFilmstrip(
  url: string,
  frameCount = 10,
  maxFrameWidth = 240
): Promise<VideoFilmstrip> {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.preload = "auto";
  video.playsInline = true;
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
    const resolvedDuration = Number.isFinite(duration) && duration > 0 ? duration : null;
    const frames: string[] = [];
    const count = Math.max(1, Math.min(16, Math.round(frameCount)));

    for (let index = 0; index < count; index += 1) {
      // Stay away from exact start/end frames, which are frequently black in
      // recorded WebM and transition-heavy imported videos.
      const ratio = count === 1 ? 0.22 : 0.06 + (index / (count - 1)) * 0.88;
      const seekTo = resolvedDuration
        ? clampNumber(resolvedDuration * ratio, 0.05, Math.max(0.05, resolvedDuration - 0.05))
        : 0.1 + index * 0.15;
      await seekVideoTo(video, seekTo);
      await waitForDecodedFrame(video);

      const frame = captureCurrentVideoFrame(video, maxFrameWidth);
      if (frame) frames.push(frame);
    }

    if (frames.length === 0) throw new Error("Video has no decodable frames.");
    return {
      frames,
      duration: resolvedDuration
    };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function captureCurrentVideoFrame(video: HTMLVideoElement, maxWidth: number): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const scale = Math.min(1, Math.max(1, maxWidth) / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function resolveVideoDuration(video: HTMLVideoElement): Promise<number> {
  return withTimeout(
    new Promise<number>((resolve, reject) => {
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
    }),
    4000,
    Number.NaN
  );
}

// Seeks and waits for the 'seeked' event, but tolerates a seek that never
// completes (or throws) by resolving anyway so the caller can still grab
// whatever frame is currently decoded rather than hanging.
function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.addEventListener("error", () => resolve(), { once: true });

      try {
        video.currentTime = time;
      } catch {
        resolve();
      }
    }),
    4000,
    undefined
  );
}

// Waits until at least one frame is decoded and ready to draw. Prefers the
// precise requestVideoFrameCallback signal and falls back to loadeddata.
function waitForDecodedFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return withTimeout(
    new Promise<void>((resolve) => {
      const withFrameCallback = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      };
      if (typeof withFrameCallback.requestVideoFrameCallback === "function") {
        withFrameCallback.requestVideoFrameCallback(() => resolve());
        return;
      }

      video.addEventListener("loadeddata", () => resolve(), { once: true });
    }),
    2000,
    undefined
  );
}

// Resolves with the promise's value, or with `fallback` if it rejects or does
// not settle within `ms`. Keeps thumbnail capture from ever hanging a caller.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }
    };

    const timer = window.setTimeout(() => settle(fallback), ms);
    promise.then((value) => settle(value)).catch(() => settle(fallback));
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

export type TimelineAudioMixSource = {
  url: string;
  /** Seconds into the media file where this clip begins. */
  sourceStart: number;
  /** Seconds of media consumed by this clip. */
  duration: number;
  /** Timeline position (seconds) where this clip starts. */
  timelineOffset: number;
  /** Linear gain applied when mixing. */
  gain: number;
};

/**
 * Decode several timeline clips and mix them at their timeline positions into
 * one mono 16 kHz Float32Array for Whisper. Sources that fail to decode (e.g.
 * a video without an audio track) are skipped; the peak is soft-normalized so
 * overlapping speakers cannot clip.
 */
export async function decodeTimelineAudioMix(
  sources: TimelineAudioMixSource[]
): Promise<Float32Array> {
  const targetRate = 16000;
  const decoded: Array<{ source: TimelineAudioMixSource; samples: Float32Array }> = [];

  for (const source of sources) {
    try {
      const samples = await decodeAudioTo16kMono(source.url);
      decoded.push({ source, samples });
    } catch {
      // No audio track (or an undecodable container) — skip this source.
    }
  }

  if (decoded.length === 0) {
    throw new Error("None of the selected sources contain decodable audio.");
  }

  const totalSeconds = decoded.reduce(
    (max, entry) => Math.max(max, entry.source.timelineOffset + entry.source.duration),
    0
  );
  const mix = new Float32Array(Math.max(1, Math.ceil(totalSeconds * targetRate)));

  for (const { source, samples } of decoded) {
    const from = Math.floor(source.sourceStart * targetRate);
    const to = Math.min(samples.length, from + Math.ceil(source.duration * targetRate));
    const offset = Math.floor(source.timelineOffset * targetRate);
    const gain = Number.isFinite(source.gain) ? Math.max(0, Math.min(4, source.gain)) : 1;

    for (let i = from; i < to; i += 1) {
      const target = offset + (i - from);
      if (target >= mix.length) break;
      mix[target] += samples[i] * gain;
    }
  }

  let peak = 0;
  for (let i = 0; i < mix.length; i += 1) {
    const magnitude = Math.abs(mix[i]);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak > 1) {
    const scale = 1 / peak;
    for (let i = 0; i < mix.length; i += 1) {
      mix[i] *= scale;
    }
  }

  return mix;
}
