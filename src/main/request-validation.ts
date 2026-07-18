/**
 * Runtime validation for IPC request payloads. The renderer is sandboxed but
 * still untrusted from the main process's perspective, so every structured
 * request is asserted before use. These guards are pure (no app state).
 */
import type {
  DeviceSelection,
  ExportVideoRequest,
  GeminiChatSendRequest,
  MusicGenerateRequest,
  ProjectDevices,
  ProjectSource,
  SaveEditorProjectStateRequest,
  StartRecordingRequest,
  SttTranscribeRequest,
  SttTranscribeSource,
  UpdateProviderKeysRequest
} from "../shared/types";
import { validateEditorStateSnapshot } from "../shared/editor-domain";

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

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function assertSaveEditorProjectStateRequest(
  value: unknown
): asserts value is SaveEditorProjectStateRequest {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Partial<SaveEditorProjectStateRequest>).projectId !== "string" ||
    !Number.isInteger((value as Partial<SaveEditorProjectStateRequest>).baseRevision) ||
    ((value as Partial<SaveEditorProjectStateRequest>).baseRevision ?? -1) < 0 ||
    !validateEditorStateSnapshot((value as Partial<SaveEditorProjectStateRequest>).state) ||
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
    !isUuid(request.jobId) ||
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
    ) ||
    (request.subtitleMode !== undefined && !["burn-in", "sidecar", "none"].includes(request.subtitleMode))
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

export function assertUpdateProviderKeysRequest(
  value: unknown
): asserts value is UpdateProviderKeysRequest {
  const request = value as Partial<UpdateProviderKeysRequest> | null;
  const keyValid = (key: unknown): boolean =>
    key === undefined || key === null || (typeof key === "string" && key.length <= 512);
  if (
    !request ||
    typeof request !== "object" ||
    (request.sttProvider !== undefined &&
      !["whisper-local", "cohere", "gemini"].includes(request.sttProvider)) ||
    !keyValid(request.cohereApiKey) ||
    !keyValid(request.geminiApiKey) ||
    (request.cohereLanguage !== undefined &&
      !(typeof request.cohereLanguage === "string" && /^[a-z]{2}$/.test(request.cohereLanguage)))
  ) {
    throw new Error("Invalid provider keys request.");
  }
}

function isValidSttSource(value: unknown): value is SttTranscribeSource {
  const source = value as Partial<SttTranscribeSource> | null;
  return Boolean(
    source &&
      typeof source === "object" &&
      typeof source.url === "string" &&
      /^ovc-(media|import):\/\//.test(source.url) &&
      Number.isFinite(source.sourceStart) && (source.sourceStart ?? -1) >= 0 &&
      Number.isFinite(source.duration) && (source.duration ?? 0) > 0 &&
      Number.isFinite(source.timelineOffset) && (source.timelineOffset ?? -1) >= 0 &&
      Number.isFinite(source.gain) && (source.gain ?? -1) >= 0 && (source.gain ?? 5) <= 4
  );
}

export function assertSttTranscribeRequest(
  value: unknown
): asserts value is SttTranscribeRequest {
  const request = value as Partial<SttTranscribeRequest> | null;
  if (
    !request ||
    typeof request !== "object" ||
    !isUuid(request.requestId) ||
    !["cohere", "gemini"].includes(request.provider ?? "") ||
    !Array.isArray(request.sources) ||
    request.sources.length === 0 ||
    request.sources.length > 32 ||
    !request.sources.every(isValidSttSource)
  ) {
    throw new Error("Invalid transcription request.");
  }
}

export function assertMusicGenerateRequest(
  value: unknown
): asserts value is MusicGenerateRequest {
  const request = value as Partial<MusicGenerateRequest> | null;
  if (
    !request ||
    typeof request !== "object" ||
    !isUuid(request.jobId) ||
    !["acestep", "lyria-clip", "lyria-pro"].includes(request.engine ?? "") ||
    typeof request.prompt !== "string" ||
    request.prompt.trim().length === 0 ||
    request.prompt.length > 2000 ||
    typeof request.lyrics !== "string" ||
    request.lyrics.length > 10000 ||
    typeof request.durationSeconds !== "number" ||
    !Number.isFinite(request.durationSeconds) ||
    request.durationSeconds < 5 ||
    request.durationSeconds > 240 ||
    !Number.isInteger(request.inferSteps) ||
    (request.inferSteps ?? 0) < 10 ||
    (request.inferSteps ?? 0) > 100 ||
    typeof request.guidanceScale !== "number" ||
    !Number.isFinite(request.guidanceScale) ||
    request.guidanceScale < 1 ||
    request.guidanceScale > 30 ||
    !(request.seed === null || (Number.isInteger(request.seed) && (request.seed ?? -1) >= 0))
  ) {
    throw new Error("Invalid music generation request.");
  }
}

export function assertGeminiChatSendRequest(
  value: unknown
): asserts value is GeminiChatSendRequest {
  const request = value as Partial<GeminiChatSendRequest> | null;
  if (
    !request ||
    typeof request !== "object" ||
    !isNonEmptyBoundedString(request.projectId, 128) ||
    typeof request.message !== "string" ||
    request.message.trim().length === 0 ||
    request.message.length > 8000 ||
    typeof request.includeVideo !== "boolean"
  ) {
    throw new Error("Invalid AI chat request.");
  }
}
