/**
 * Runtime validation for IPC request payloads. The renderer is sandboxed but
 * still untrusted from the main process's perspective, so every structured
 * request is asserted before use. These guards are pure (no app state).
 */
import type {
  DeviceSelection,
  ExportVideoRequest,
  ProjectDevices,
  ProjectSource,
  SaveEditorProjectStateRequest,
  StartRecordingRequest
} from "../shared/types";

export function assertStartRecordingRequest(
  value: unknown
): asserts value is StartRecordingRequest {
  const request = value as Partial<StartRecordingRequest> | null;
  if (
    !request ||
    typeof request !== "object" ||
    !isNonEmptyBoundedString(request.projectId, 128) ||
    !isValidProjectSource(request.source) ||
    !isValidProjectDevices(request.devices) ||
    !isValidRecordingTracks(request.tracks)
  ) {
    throw new Error("Invalid recording start request.");
  }
}

export function assertSaveEditorProjectStateRequest(
  value: unknown
): asserts value is SaveEditorProjectStateRequest {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Partial<SaveEditorProjectStateRequest>).projectId !== "string" ||
    !Array.isArray((value as Partial<SaveEditorProjectStateRequest>).imports)
  ) {
    throw new Error("Invalid editor save request.");
  }
}

export function assertExportVideoRequest(value: unknown): asserts value is ExportVideoRequest {
  const request = value as Partial<ExportVideoRequest> | null;
  const sourceIdValid = request?.source?.kind === "project"
    ? typeof request.source.projectId === "string" && request.source.projectId.length > 0
    : request?.source?.kind === "import"
      ? typeof request.source.importId === "string" && request.source.importId.length > 0
      : false;
  const audioLevelsValid = request?.audioLevels && typeof request.audioLevels === "object"
    ? Object.values(request.audioLevels).every((level) =>
        Boolean(level) && Number.isFinite(level.volume) && typeof level.muted === "boolean"
      )
    : false;
  if (
    !request ||
    typeof request !== "object" ||
    !request.source ||
    !sourceIdValid ||
    !["mp4", "webm", "mov"].includes(request.format ?? "") ||
    !["source", "720p", "1080p", "1440p"].includes(request.resolution ?? "") ||
    typeof request.trimStart !== "number" || !Number.isFinite(request.trimStart) || request.trimStart < 0 ||
    (request.trimEnd !== null && (typeof request.trimEnd !== "number" || !Number.isFinite(request.trimEnd) || request.trimEnd < 0)) ||
    typeof request.volume !== "number" || !Number.isFinite(request.volume) || request.volume < 0 || request.volume > 4 ||
    !audioLevelsValid ||
    !Array.isArray(request.backgroundAudioImportIds) ||
    !request.backgroundAudioImportIds.every((id) => typeof id === "string" && id.length > 0) ||
    !Array.isArray(request.subtitles) ||
    !request.subtitles.every((subtitle) =>
      Boolean(subtitle) &&
      typeof subtitle.text === "string" &&
      Number.isFinite(subtitle.start) &&
      Number.isFinite(subtitle.end) &&
      subtitle.end >= subtitle.start
    )
  ) {
    throw new Error("Invalid video export request.");
  }
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNullableBoundedString(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function isValidProjectSource(value: unknown): value is ProjectSource {
  const source = value as Partial<ProjectSource> | null;
  return Boolean(
    source &&
      typeof source === "object" &&
      isNonEmptyBoundedString(source.id, 512) &&
      isNullableBoundedString(source.name, 512) &&
      (source.kind === "screen" || source.kind === "window") &&
      isNullableBoundedString(source.displayId, 128)
  );
}

function isValidDeviceSelection(value: unknown): value is DeviceSelection {
  const selection = value as Partial<DeviceSelection> | null;
  return Boolean(
    selection &&
      typeof selection === "object" &&
      typeof selection.enabled === "boolean" &&
      isNullableBoundedString(selection.deviceId, 512) &&
      isNullableBoundedString(selection.label, 512)
  );
}

function isValidProjectDevices(value: unknown): value is ProjectDevices {
  const devices = value as Partial<ProjectDevices> | null;
  return Boolean(
    devices &&
      typeof devices === "object" &&
      isValidDeviceSelection(devices.microphone) &&
      isValidDeviceSelection(devices.camera)
  );
}

function isValidTrackMime(value: unknown, required: boolean): boolean {
  if (value === null || value === undefined) {
    return !required;
  }
  return typeof value === "string" && value.length > 0 && value.length <= 255;
}

function isValidRecordingTracks(value: unknown): value is StartRecordingRequest["tracks"] {
  const tracks = value as Partial<StartRecordingRequest["tracks"]> | null;
  if (!tracks || typeof tracks !== "object") {
    return false;
  }

  const optionalTrackValid = (track: unknown): boolean => {
    const entry = track as { enabled?: unknown; mimeType?: unknown } | null;
    return Boolean(
      entry &&
        typeof entry === "object" &&
        typeof entry.enabled === "boolean" &&
        isValidTrackMime(entry.mimeType, false)
    );
  };

  const screen = tracks.screen as { enabled?: unknown; mimeType?: unknown } | undefined;
  return Boolean(
    screen &&
      typeof screen === "object" &&
      screen.enabled === true &&
      isValidTrackMime(screen.mimeType, true) &&
      optionalTrackValid(tracks.camera) &&
      optionalTrackValid(tracks.mic) &&
      optionalTrackValid(tracks.system)
  );
}
