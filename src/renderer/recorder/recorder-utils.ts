/**
 * Recorder helpers: mime-type candidates, optional camera/mic streams,
 * multi-source capture planning, sequential display capture, MediaRecorder
 * construction per track, and small formatting utilities.
 */
import type {
  DeviceSelection,
  MediaTrackKey,
  ProjectDevices,
  RecordingCapture,
  RecordingTrack,
  SourceSummary
} from "../../shared/types";
import { createRecordingTrackId } from "../../shared/types";
import {
  createMediaRecorderOptions,
  type RecorderKind
} from "../recording-runtime";
import type { DeviceOption, RecorderMap } from "./types";

export const videoMimeCandidates = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

export const audioMimeCandidates = ["audio/webm;codecs=opus", "audio/webm"];

export async function runCountdown(setCountdown: (value: number) => void): Promise<void> {
  for (let value = 3; value >= 1; value -= 1) {
    setCountdown(value);
    await delay(1000);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getOptionalCameraStream(
  enabled: boolean,
  deviceId: string | null,
  dimensions?: { width: number; height: number },
  onError?: (message: string) => void
): Promise<MediaStream | null> {
  if (!enabled || !deviceId) {
    return null;
  }

  const video: MediaTrackConstraints = { deviceId: { exact: deviceId } };
  if (dimensions) {
    video.width = { ideal: dimensions.width };
    video.height = { ideal: dimensions.height };
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (error) {
    onError?.(`Could not access the camera: ${toErrorMessage(error)}`);
    return null;
  }
}

export async function getOptionalMicStream(
  enabled: boolean,
  deviceId: string | null,
  onError?: (message: string) => void
): Promise<MediaStream | null> {
  if (!enabled || !deviceId) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: {
          exact: deviceId
        }
      }
    });
  } catch (error) {
    onError?.(`Could not access the microphone: ${toErrorMessage(error)}`);
    return null;
  }
}

/**
 * Build the capture plan sent to main: one media track per selected screen,
 * camera, microphone, and system-audio source. The first source of each kind
 * keeps the legacy track id, so single-source recordings stay compatible.
 */
export function createRecordingCaptures(input: {
  screens: Array<{ sourceId: string; label: string; mimeType: string }>;
  cameras: Array<{ deviceId: string; label: string; mimeType: string }>;
  mic: { deviceId: string; label: string; mimeType: string } | null;
  system: { mimeType: string } | null;
}): RecordingCapture[] {
  const captures: RecordingCapture[] = [];

  input.screens.forEach((screen, index) => {
    captures.push({
      trackId: createRecordingTrackId("screen", index),
      kind: "screen",
      sourceId: screen.sourceId,
      label: screen.label,
      mimeType: screen.mimeType
    });
  });

  input.cameras.forEach((camera, index) => {
    captures.push({
      trackId: createRecordingTrackId("camera", index),
      kind: "camera",
      sourceId: camera.deviceId,
      label: camera.label,
      mimeType: camera.mimeType
    });
  });

  if (input.mic) {
    captures.push({
      trackId: createRecordingTrackId("mic", 0),
      kind: "mic",
      sourceId: input.mic.deviceId,
      label: input.mic.label,
      mimeType: input.mic.mimeType
    });
  }

  if (input.system) {
    captures.push({
      trackId: createRecordingTrackId("system", 0),
      kind: "system",
      sourceId: null,
      label: "System audio",
      mimeType: input.system.mimeType
    });
  }

  return captures;
}

/** A display capture stream only has to expose its tracks to be usable. */
export interface DisplayCaptureStream {
  getAudioTracks(): MediaStreamTrack[];
  getVideoTracks(): MediaStreamTrack[];
}

/**
 * Capture every selected display strictly one after another. The main process
 * hands the reserved display source to the next getDisplayMedia call, so
 * parallel captures would race over that single selection.
 *
 * System/desktop audio is requested once, on the first display capture, and
 * moved onto its own track list — microphone audio never shares its stream.
 */
export async function captureDisplayStreamsSequentially(input: {
  sourceIds: string[];
  systemAudio: boolean;
  createOptions: (withSystemAudio: boolean) => DisplayMediaStreamOptions;
  selectSource: (sourceId: string) => Promise<unknown>;
  releaseSource: () => Promise<unknown>;
  getDisplayMedia: (options: DisplayMediaStreamOptions) => Promise<DisplayCaptureStream>;
}): Promise<{
  screens: Array<{ sourceId: string; stream: DisplayCaptureStream }>;
  systemAudioTracks: MediaStreamTrack[];
}> {
  if (input.sourceIds.length === 0) {
    throw new Error("Select at least one screen or window to record.");
  }

  const screens: Array<{ sourceId: string; stream: DisplayCaptureStream }> = [];
  const systemAudioTracks: MediaStreamTrack[] = [];

  const capture = async (sourceId: string, withSystemAudio: boolean) => {
    await input.selectSource(sourceId);
    return input.getDisplayMedia(input.createOptions(withSystemAudio));
  };

  try {
    for (const sourceId of input.sourceIds) {
      const wantsSystemAudio = input.systemAudio && systemAudioTracks.length === 0;
      let stream: DisplayCaptureStream;

      try {
        stream = await capture(sourceId, wantsSystemAudio);
      } catch (error) {
        if (!wantsSystemAudio) {
          throw error;
        }
        // Some platforms reject a display capture that also asks for audio;
        // retry video-only so the screen is still recorded.
        await input.releaseSource().catch(() => undefined);
        stream = await capture(sourceId, false);
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        systemAudioTracks.push(...audioTracks);
      }
      screens.push({ sourceId, stream });
    }
  } catch (error) {
    await input.releaseSource().catch(() => undefined);
    throw error;
  }

  return { screens, systemAudioTracks };
}

export function createRecorders(input: {
  captures: Array<{
    trackId: MediaTrackKey;
    stream: MediaStream;
    mimeType: string;
    kind: RecorderKind;
    videoBitsPerSecond?: number;
  }>;
  onChunk: (trackId: MediaTrackKey, blob: Blob) => void;
  onError: (error: unknown) => void;
}): RecorderMap {
  const recorders: RecorderMap = {};

  for (const capture of input.captures) {
    recorders[capture.trackId] = createRecorder(
      capture.stream,
      capture.mimeType,
      (blob) => input.onChunk(capture.trackId, blob),
      capture.kind,
      capture.videoBitsPerSecond
    );
  }

  Object.values(recorders).forEach((recorder) => {
    if (recorder) {
      recorder.onerror = (event) => input.onError(event);
    }
  });

  return recorders;
}

function createRecorder(
  stream: MediaStream,
  mimeType: string,
  onChunk: (blob: Blob) => void,
  kind: RecorderKind,
  videoBitsPerSecond?: number
): MediaRecorder {
  const recorder = new MediaRecorder(
    stream,
    createMediaRecorderOptions(kind, mimeType, videoBitsPerSecond)
  );
  recorder.ondataavailable = (event) => onChunk(event.data);
  return recorder;
}

export function stopRecorder(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "inactive") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener(
      "error",
      (event) => {
        const recorderError = (event as Event & { error?: DOMException }).error;
        reject(new Error(`Recorder failed: ${recorderError?.message ?? event.type}`));
      },
      { once: true }
    );
    recorder.stop();
  });
}

export function getSupportedMimeType(candidates: string[]): string {
  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));

  if (!supported) {
    throw new Error("This version of Chromium cannot record WebM media.");
  }

  return supported;
}

export function createProjectDevices(input: {
  microphones: DeviceOption[];
  cameras: DeviceOption[];
  micEnabled: boolean;
  cameraEnabled: boolean;
  selectedMicId: string | null;
  selectedCameraId: string | null;
}): ProjectDevices {
  return {
    microphone: createDeviceSelection(
      input.micEnabled,
      input.selectedMicId,
      input.microphones
    ),
    camera: createDeviceSelection(input.cameraEnabled, input.selectedCameraId, input.cameras)
  };
}

function createDeviceSelection(
  enabled: boolean,
  deviceId: string | null,
  options: DeviceOption[]
): DeviceSelection {
  const match = options.find((option) => option.deviceId === deviceId);

  return {
    enabled,
    deviceId: enabled ? deviceId : null,
    label: enabled ? match?.label ?? null : null
  };
}

export function getDeviceLabel(
  options: DeviceOption[],
  value: string | null,
  fallback: string
): string {
  return options.find((option) => option.deviceId === value)?.label ?? fallback;
}

/**
 * Toggle a screen/window in the recording selection. The last remaining source
 * stays selected so a recording always has something to capture.
 */
export function toggleSourceSelection(current: string[], sourceId: string): string[] {
  if (!current.includes(sourceId)) {
    return [...current, sourceId];
  }

  return current.length > 1 ? current.filter((id) => id !== sourceId) : current;
}

/** Drop sources that disappeared and default to the first screen. */
export function reconcileSourceSelection(
  sources: SourceSummary[],
  current: string[]
): string[] {
  const available = current.filter((id) => sources.some((source) => source.id === id));
  if (available.length > 0) {
    return available;
  }

  const first = sources.find((source) => source.kind === "screen") ?? sources[0];
  return first ? [first.id] : [];
}

/** Toggle one camera device; any number of cameras may stay selected. */
export function toggleCameraSelection(current: string[], deviceId: string): string[] {
  return current.includes(deviceId)
    ? current.filter((id) => id !== deviceId)
    : [...current, deviceId];
}

/** Drop camera devices that are no longer connected. */
export function reconcileCameraSelection(
  cameras: DeviceOption[],
  current: string[]
): string[] {
  return current.filter((deviceId) =>
    cameras.some((camera) => camera.deviceId === deviceId)
  );
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainingSeconds).padStart(2, "0");
  // Recordings over an hour are supported; only widen to H:MM:SS when needed so
  // short clips stay MM:SS.
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function truncateLabel(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}...` : value;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return stripIpcErrorPrefix(error.message);
  }

  return stripIpcErrorPrefix(String(error));
}

function stripIpcErrorPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*/, "");
}
