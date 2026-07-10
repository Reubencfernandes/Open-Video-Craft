/**
 * Recorder helpers: mime-type candidates, optional camera/mic streams,
 * MediaRecorder construction per track, and small formatting utilities.
 */
import type { DeviceSelection, ProjectDevices, RecordingTrack } from "../../shared/types";
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
  deviceId: string | null
): Promise<MediaStream | null> {
  if (!enabled || !deviceId) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: deviceId
        }
      },
      audio: false
    });
  } catch {
    return null;
  }
}

export async function getOptionalMicStream(
  enabled: boolean,
  deviceId: string | null
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
  } catch {
    return null;
  }
}

export function createRecorders(input: {
  screenStream: MediaStream;
  cameraStream: MediaStream | null;
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  screenMimeType: string;
  cameraMimeType: string | null;
  micMimeType: string | null;
  systemMimeType: string | null;
  onChunk: (track: RecordingTrack, blob: Blob) => void;
  onError: (error: unknown) => void;
}): RecorderMap {
  const recorders: RecorderMap = {
    screen: createRecorder(
      input.screenStream,
      input.screenMimeType,
      (blob) => input.onChunk("screen", blob),
      "video"
    )
  };

  if (input.cameraStream && input.cameraMimeType) {
    recorders.camera = createRecorder(
      input.cameraStream,
      input.cameraMimeType,
      (blob) => input.onChunk("camera", blob),
      "video"
    );
  }

  if (input.micStream && input.micMimeType) {
    recorders.mic = createRecorder(
      input.micStream,
      input.micMimeType,
      (blob) => input.onChunk("mic", blob),
      "audio"
    );
  }

  if (input.systemStream && input.systemMimeType) {
    recorders.system = createRecorder(
      input.systemStream,
      input.systemMimeType,
      (blob) => input.onChunk("system", blob),
      "audio"
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
  kind: RecorderKind
): MediaRecorder {
  const recorder = new MediaRecorder(stream, createMediaRecorderOptions(kind, mimeType));
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
      (event) => reject(new Error(`Recorder failed: ${event.type}`)),
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

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
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
