/**
 * App-level recorder preferences persisted in userData (never inside a
 * project): which screens/windows, webcams and microphone to record, plus the
 * capture quality. The owner picks these once and every new recording reuses
 * them, so the selection survives app restarts and project switches.
 */

// Ordered from best to worst; the first entry is the maximum quality.
export const screenQualityIds = ["source", "1440p", "1080p", "720p"] as const;
export type ScreenQuality = (typeof screenQualityIds)[number];

export const cameraQualityIds = ["1080p", "720p", "480p"] as const;
export type CameraQuality = (typeof cameraQualityIds)[number];

export interface RecorderSettings {
  schemaVersion: 1;
  /** Screen and window source ids the owner selected. */
  sourceIds: string[];
  /** Camera device ids the owner selected. */
  cameraIds: string[];
  /**
   * The microphone has no quality tier: it is captured with the existing
   * default best constraints, so only its device and on/off state persist.
   */
  micId: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  systemAudioEnabled: boolean;
  screenQuality: ScreenQuality;
  cameraQuality: CameraQuality;
}

/** The devices currently available; stored selections are reconciled to them. */
export interface RecorderAvailableDevices {
  sources: Array<{ id: string; kind: "screen" | "window" }>;
  cameras: Array<{ deviceId: string }>;
  microphones: Array<{ deviceId: string }>;
}

const maxIdLength = 256;
const maxSourceCount = 64;
const maxDeviceCount = 32;

function isQuality<T extends string>(value: unknown, ids: readonly T[]): value is T {
  return typeof value === "string" && (ids as readonly string[]).includes(value);
}

// Enumeration can briefly expose devices without a usable id (for example
// before the camera/microphone permission is granted); never persist those.
function hasId(value: string): boolean {
  return value.length > 0;
}

function isIdList(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every(
      (item) =>
        typeof item === "string" && item.length > 0 && item.length <= maxIdLength
    )
  );
}

/**
 * Genuine first run: every screen and every webcam at maximum quality, the
 * microphone on, windows left out on purpose (they are transient and the owner
 * picks them explicitly). A capture kind with no device stays disabled.
 */
export function createDefaultRecorderSettings(
  devices: RecorderAvailableDevices
): RecorderSettings {
  return {
    schemaVersion: 1,
    sourceIds: devices.sources
      .filter((source) => source.kind === "screen" && hasId(source.id))
      .map((source) => source.id),
    cameraIds: devices.cameras.map((camera) => camera.deviceId).filter(hasId),
    micId: devices.microphones.map((microphone) => microphone.deviceId).find(hasId) ?? null,
    micEnabled: devices.microphones.length > 0,
    cameraEnabled: devices.cameras.length > 0,
    systemAudioEnabled: false,
    screenQuality: screenQualityIds[0],
    cameraQuality: cameraQualityIds[0]
  };
}

/**
 * Keep only the stored ids that still exist, fall back to the remaining
 * microphone when the stored one is gone, and disable a capture kind whose
 * selection or devices disappeared.
 */
export function reconcileRecorderSettings(
  settings: RecorderSettings,
  devices: RecorderAvailableDevices
): RecorderSettings {
  const sourceIds = settings.sourceIds.filter(
    (id) => hasId(id) && devices.sources.some((source) => source.id === id)
  );
  const cameraIds = settings.cameraIds.filter(
    (id) => hasId(id) && devices.cameras.some((camera) => camera.deviceId === id)
  );
  const micId = settings.micId && hasId(settings.micId) && devices.microphones.some(
    (microphone) => microphone.deviceId === settings.micId
  )
    ? settings.micId
    : devices.microphones.map((microphone) => microphone.deviceId).find(hasId) ?? null;

  return {
    schemaVersion: 1,
    sourceIds,
    cameraIds,
    micId,
    micEnabled: settings.micEnabled && devices.microphones.length > 0,
    cameraEnabled: settings.cameraEnabled && cameraIds.length > 0,
    systemAudioEnabled: settings.systemAudioEnabled,
    screenQuality: settings.screenQuality,
    cameraQuality: settings.cameraQuality
  };
}

/** Validate a persisted settings file; returns null instead of throwing. */
export function parseRecorderSettings(value: unknown): RecorderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<RecorderSettings>;

  if (
    candidate.schemaVersion !== 1 ||
    !isIdList(candidate.sourceIds, maxSourceCount) ||
    !isIdList(candidate.cameraIds, maxDeviceCount) ||
    (candidate.micId !== null &&
      !(typeof candidate.micId === "string" &&
        candidate.micId.length > 0 &&
        candidate.micId.length <= maxIdLength)) ||
    typeof candidate.micEnabled !== "boolean" ||
    typeof candidate.cameraEnabled !== "boolean" ||
    typeof candidate.systemAudioEnabled !== "boolean" ||
    !isQuality(candidate.screenQuality, screenQualityIds) ||
    !isQuality(candidate.cameraQuality, cameraQualityIds)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    sourceIds: candidate.sourceIds,
    cameraIds: candidate.cameraIds,
    micId: candidate.micId,
    micEnabled: candidate.micEnabled,
    cameraEnabled: candidate.cameraEnabled,
    systemAudioEnabled: candidate.systemAudioEnabled,
    screenQuality: candidate.screenQuality,
    cameraQuality: candidate.cameraQuality
  };
}
