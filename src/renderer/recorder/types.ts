/**
 * Types shared by the recorder controller and its view.
 */
import type { RecordingTrack } from "../../shared/types";

export type FloatingState =
  | "ready"
  | "preparing"
  | "countdown"
  | "recording"
  | "paused"
  | "stopping"
  | "processing"
  | "complete"
  | "failed";

export type DeviceOption = {
  deviceId: string;
  label: string;
};

export type RecorderMap = Partial<Record<RecordingTrack, MediaRecorder>>;
export type WriteQueues = Partial<Record<RecordingTrack, Promise<unknown>>>;
