export type RecordingStatus =
  | "created"
  | "recording"
  | "processing"
  | "complete"
  | "failed";

export type RecordingTrack = "screen" | "camera" | "mic";

export type MediaTrackKey = "screen" | "camera" | "micWebm" | "micWav";

export interface SourceSummary {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string;
  thumbnail: string;
  appIcon: string | null;
}

export interface DeviceSelection {
  enabled: boolean;
  deviceId: string | null;
  label: string | null;
}

export interface ProjectDevices {
  microphone: DeviceSelection;
  camera: DeviceSelection;
}

export interface ProjectSource {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string;
}

export interface ProjectTrack {
  path: string;
  mimeType: string;
  bytesWritten: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  schemaVersion: 1;
  appVersion: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: RecordingStatus;
  source: ProjectSource | null;
  devices: ProjectDevices;
  tracks: Partial<Record<MediaTrackKey, ProjectTrack>>;
  durationMs: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  error: string | null;
}

export interface ProjectView extends ProjectFile {
  rootPath: string;
  mediaUrls: Partial<Record<MediaTrackKey, string>>;
}

export interface CreateProjectRequest {
  name: string;
  baseDirectory?: string | null;
}

export interface StartRecordingRequest {
  projectId: string;
  source: ProjectSource;
  devices: ProjectDevices;
  tracks: {
    screen: { enabled: true; mimeType: string };
    camera: { enabled: boolean; mimeType: string | null };
    mic: { enabled: boolean; mimeType: string | null };
  };
}

export interface StopRecordingRequest {
  projectId: string;
  durationMs: number;
}

export interface WriteChunkRequest {
  projectId: string;
  track: RecordingTrack;
  chunk: ArrayBuffer;
}

export interface FailRecordingRequest {
  projectId: string;
  error: string;
}

export interface DefaultEditsFile {
  schemaVersion: 1;
  aspectRatio: "16:9";
  background: {
    type: "gradient";
    preset: "blue-red";
  };
  screen: {
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadius: number;
    shadow: boolean;
  };
  camera: {
    enabled: boolean;
    shape: "circle";
    x: number;
    y: number;
    size: number;
    border: boolean;
    shadow: boolean;
  };
  subtitles: {
    enabled: false;
    font: "Inter";
    fontSize: number;
    position: "bottom";
    highlightWords: boolean;
  };
  zoomEffects: Array<{
    start: number;
    end: number;
    scale: number;
    x: number;
    y: number;
  }>;
}

export interface SubtitlesFile {
  schemaVersion: 1;
  language: string | null;
  generatedAt: string | null;
  segments: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    words?: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  }>;
}

export interface FfmpegStatus {
  ffmpegPath: string;
  ffprobePath: string;
}

export interface SourceOverlayResult {
  shown: boolean;
  reason: string | null;
}
