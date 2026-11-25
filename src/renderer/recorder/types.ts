/**
 * Types shared by the recorder controller and its view.
 */
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

import type { MediaTrackKey } from "../../shared/types";

export type RecorderMap = Partial<Record<MediaTrackKey, MediaRecorder>>;
export type WriteQueues = Partial<Record<MediaTrackKey, Promise<unknown>>>;
