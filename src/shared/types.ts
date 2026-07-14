import type {
  EditorMutation,
  EditorStateSnapshot
} from "./editor-domain";

/**
 * Types shared by the main process, preload bridge, and renderer: recording
 * tracks, project files, permissions, editor imports, and export requests.
 */
export type RecordingStatus =
  | "created"
  | "recording"
  | "processing"
  | "complete"
  | "failed";

export type RecordingTrack = "screen" | "camera" | "mic" | "system";

export type MediaTrackKey =
  | "screen"
  | "camera"
  | "micWebm"
  | "micWav"
  | "systemWebm"
  | "systemWav";

export interface SourceSummary {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string;
  thumbnail: string;
  appIcon: string | null;
}

export type DesktopPermissionKind = "screen" | "camera" | "microphone";

export type DesktopPermissionState =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown"
  | "unavailable";

export interface DesktopPermissionStatus {
  platform: "darwin" | "win32" | "linux" | "other";
  canDragAppBundle: boolean;
  screen: DesktopPermissionState;
  camera: DesktopPermissionState;
  microphone: DesktopPermissionState;
}

export interface AppInfo {
  version: string;
  isPackaged: boolean;
  platform: NodePlatform;
}

export type NodePlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export type UpdateStatusState =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateStatus {
  state: UpdateStatusState;
  currentVersion: string;
  latestVersion: string | null;
  message: string;
  checkedAt: string | null;
  downloadProgress: number | null;
  isPackaged: boolean;
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

export interface ProjectMediaAvailability {
  screen: boolean;
  camera: boolean;
  audio: boolean;
}

export interface ProjectLibraryEntry {
  id: string;
  name: string;
  rootPath: string;
  status: RecordingStatus;
  durationMs: number | null;
  updatedAt: string;
  mediaAvailability: ProjectMediaAvailability;
  available: boolean;
  /** Runtime preview URL for the screen/camera track; not required in older indexes. */
  thumbnailUrl?: string | null;
}

export interface CreateProjectRequest {
  name: string;
  baseDirectory?: string | null;
}

export interface RenameProjectRequest {
  projectId: string;
  name: string;
}

export interface StartRecordingRequest {
  projectId: string;
  source: ProjectSource;
  devices: ProjectDevices;
  tracks: {
    screen: { enabled: true; mimeType: string };
    camera: { enabled: boolean; mimeType: string | null };
    mic: { enabled: boolean; mimeType: string | null };
    system: { enabled: boolean; mimeType: string | null };
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

export interface SourceOverlayResult {
  shown: boolean;
  reason: string | null;
}

export type ImportedMediaKind = "video" | "audio" | "image";

export interface ImportedMediaFile {
  id: string;
  name: string;
  path: string;
  url: string;
  kind: ImportedMediaKind;
  extension: string;
}

/**
 * A project-owned import. `relativePath` is deliberately kept inside the
 * project folder so saved edits remain available after the app restarts or is
 * moved to another machine.
 */
export interface EditorProjectImport {
  id: string;
  name: string;
  kind: ImportedMediaKind;
  extension: string;
  duration: number | null;
  relativePath: string;
}

export type EditorProjectImportInput = Omit<EditorProjectImport, "relativePath">;

export interface EditorProjectStateFile {
  schemaVersion: 2;
  revision: number;
  savedAt: string;
  state: EditorStateSnapshot;
  imports: EditorProjectImport[];
  lastMutation: EditorMutation;
}

export interface SaveEditorProjectStateRequest {
  projectId: string;
  baseRevision: number;
  state: EditorStateSnapshot;
  imports: EditorProjectImportInput[];
}

export interface EditorProjectStateView {
  revision: number;
  savedAt: string;
  state: EditorStateSnapshot;
  lastMutation: EditorMutation;
  imports: Array<EditorProjectImportInput & { url: string }>;
}

export type AiProvider = "codex" | "claude";

export interface AiConnectionProviderStatus {
  provider: AiProvider;
  installed: boolean;
  supported: boolean;
  configured: boolean;
  version: string | null;
  setupCommand: string;
  message: string | null;
}

export interface AiConnectionStatus {
  privacyAccepted: boolean;
  providers: AiConnectionProviderStatus[];
}

export interface ConfigureAiProviderRequest {
  provider: AiProvider;
  privacyAccepted: boolean;
}

export interface EditorSessionStateRequest {
  projectId: string;
  dirty: boolean;
}

export interface UndoAgentEditRequest {
  projectId: string;
  baseRevision: number;
  editId: string;
}

export type ExportVideoFormat = "mp4" | "webm" | "mov";

export type ExportResolution = "source" | "720p" | "1080p" | "1440p";
export type ExportSubtitleMode = "burn-in" | "sidecar" | "none";

export interface ExportVideoRequest {
  /** Renderer-generated UUID used for progress events and cancellation. */
  jobId?: string;
  source:
    | {
        kind: "project";
        projectId: string;
      }
    | {
        kind: "import";
        importId: string;
      };
  format: ExportVideoFormat;
  resolution: ExportResolution;
  trimStart: number;
  trimEnd: number | null;
  volume: number;
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  backgroundAudioImportIds: string[];
  subtitles: Array<{ start: number; end: number; text: string }>;
  subtitleMode?: ExportSubtitleMode;
}

export interface ExportVideoResult {
  path: string;
  bytesWritten: number;
  subtitlePath: string | null;
}

export interface ExportProgress {
  jobId: string;
  percent: number;
  message: string;
}
