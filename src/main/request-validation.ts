/**
 * Runtime validation for IPC request payloads. The renderer is sandboxed but
 * still untrusted from the main process's perspective, so every structured
 * request is asserted before use. These guards are pure (no app state).
 */
import type {
  ClaudeChatRequest,
  ClaudeChatTurn,
  AudioCleanupPreviewRequest,
  MicTranscriptionRequest,
  ImportRecordedClipRequest,
  DeviceSelection,
  ExportVideoRequest,
  GeminiChatSendRequest,
  MatrixPopupRequest,
  MusicGenerateRequest,
  ProviderKeyId,
  ProjectDevices,
  ProjectSource,
  SaveEditorProjectStateRequest,
  StartRecordingRequest,
  SttTranscribeRequest,
  SttTranscribeSource,
  UpdateProviderKeysRequest
} from "../shared/types";
import { isTextOverlay, validateEditorStateSnapshot } from "../shared/editor-domain";

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
    (request.subtitleMode !== undefined && !["burn-in", "sidecar", "none"].includes(request.subtitleMode)) ||
    (request.textOverlays !== undefined &&
      (!Array.isArray(request.textOverlays) || !request.textOverlays.every(isTextOverlay)))
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

export function assertProviderKeyId(value: unknown): asserts value is ProviderKeyId {
  if (value !== "cohere" && value !== "gemini") {
    throw new Error("Invalid provider key.");
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
    !["claude-local", "lyria-clip", "lyria-pro"].includes(request.engine ?? "") ||
    typeof request.prompt !== "string" ||
    request.prompt.trim().length === 0 ||
    request.prompt.length > 2000 ||
    typeof request.lyrics !== "string" ||
    request.lyrics.length > 10000
  ) {
    throw new Error("Invalid music generation request.");
  }
}

const MATRIX_POPUP_POSITIONS = [
  "top-left", "top-center", "top-right", "center",
  "bottom-left", "bottom-center", "bottom-right"
] as const;
const MATRIX_POPUP_TONES = ["info", "success", "warning", "error"] as const;

function isCssPopupValue(value: unknown): boolean {
  return typeof value === "string" && value.length <= 120
    && !/[;{}<>\\]/u.test(value) && !/url\s*\(/iu.test(value);
}

export function assertMatrixPopupRequest(value: unknown): asserts value is MatrixPopupRequest {
  const request = value as Partial<MatrixPopupRequest> | null;
  if (
    !request || typeof request !== "object" ||
    typeof request.text !== "string" || request.text.length === 0 || request.text.length > 2_000 ||
    (request.title !== undefined && (typeof request.title !== "string" || request.title.length > 200)) ||
    (request.position !== undefined && !MATRIX_POPUP_POSITIONS.includes(request.position)) ||
    (request.tone !== undefined && !MATRIX_POPUP_TONES.includes(request.tone)) ||
    (request.durationMs !== undefined && (!Number.isFinite(request.durationMs) || request.durationMs < 0 || request.durationMs > 3_600_000)) ||
    (request.id !== undefined && (!isNonEmptyBoundedString(request.id, 128))) ||
    (request.accentColor !== undefined && !isCssPopupValue(request.accentColor)) ||
    (request.backgroundColor !== undefined && !isCssPopupValue(request.backgroundColor)) ||
    (request.textColor !== undefined && !isCssPopupValue(request.textColor)) ||
    (request.fontFamily !== undefined && !isCssPopupValue(request.fontFamily)) ||
    (request.fontSize !== undefined && (!Number.isInteger(request.fontSize) || request.fontSize < 10 || request.fontSize > 32)) ||
    (request.fontWeight !== undefined && (!Number.isInteger(request.fontWeight) || request.fontWeight < 400 || request.fontWeight > 900)) ||
    (request.borderRadius !== undefined && (!Number.isInteger(request.borderRadius) || request.borderRadius < 0 || request.borderRadius > 32)) ||
    (request.padding !== undefined && (!Number.isInteger(request.padding) || request.padding < 4 || request.padding > 64)) ||
    (request.width !== undefined && (!Number.isInteger(request.width) || request.width < 180 || request.width > 900)) ||
    (request.scanlines !== undefined && typeof request.scanlines !== "boolean") ||
    (request.closable !== undefined && typeof request.closable !== "boolean") ||
    (request.pauseOnHover !== undefined && typeof request.pauseOnHover !== "boolean")
  ) {
    throw new Error("Invalid matrix popup request.");
  }
}

export function assertClaudeChatRequest(value: unknown): asserts value is ClaudeChatRequest {
  const request = value as Partial<ClaudeChatRequest> | null;
  if (
    !request ||
    typeof request !== "object" ||
    !isNonEmptyBoundedString(request.projectId, 128) ||
    typeof request.message !== "string" ||
    request.message.trim().length === 0 ||
    request.message.length > 8_000
  ) {
    throw new Error("Invalid Claude chat request.");
  }
  if (request.history === undefined) return;
  if (!Array.isArray(request.history) || request.history.length > 12) {
    throw new Error("Invalid Claude chat request.");
  }
  for (const turn of request.history) {
    if (!isClaudeChatTurn(turn)) throw new Error("Invalid Claude chat request.");
  }
}

function isClaudeChatTurn(value: unknown): value is ClaudeChatTurn {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!("role" in value) || !("text" in value)) return false;
  const role: unknown = value.role;
  const text: unknown = value.text;
  return (role === "user" || role === "assistant") &&
    typeof text === "string" && text.trim().length > 0 && text.length <= 4_000;
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


export function assertAudioCleanupPreviewRequest(
  value: unknown
): asserts value is AudioCleanupPreviewRequest {
  const request = value as Partial<AudioCleanupPreviewRequest> | null;
  if (
    !request || typeof request !== "object" ||
    !isUuid(request.jobId) ||
    !isNonEmptyBoundedString(request.projectId, 128) ||
    !isNonEmptyBoundedString(request.itemId, 128) ||
    !["wind", "room", "steady"].includes(request.preset ?? "") ||
    typeof request.strength !== "number" || !Number.isFinite(request.strength) ||
    request.strength < 0 || request.strength > 100
  ) {
    throw new Error("Invalid audio cleanup preview request.");
  }
}


export function assertMicTranscriptionRequest(
  value: unknown
): asserts value is MicTranscriptionRequest {
  const request = value as Partial<MicTranscriptionRequest> | null;
  if (
    !request || typeof request !== "object" ||
    !isUuid(request.requestId) ||
    !(request.audio instanceof ArrayBuffer) ||
    request.audio.byteLength === 0 || request.audio.byteLength > 16 * 1024 * 1024
  ) {
    throw new Error("Invalid microphone transcription request.");
  }
}


export function assertImportRecordedClipRequest(
  value: unknown
): asserts value is ImportRecordedClipRequest {
  const request = value as Partial<ImportRecordedClipRequest> | null;
  if (
    !request || typeof request !== "object" ||
    !isNonEmptyBoundedString(request.projectId, 128) ||
    !isUuid(request.requestId) ||
    !isNonEmptyBoundedString(request.name, 200) ||
    !(request.data instanceof ArrayBuffer) ||
    request.data.byteLength === 0 || request.data.byteLength > 256 * 1024 * 1024
  ) {
    throw new Error("Invalid recorded clip import request.");
  }
}
