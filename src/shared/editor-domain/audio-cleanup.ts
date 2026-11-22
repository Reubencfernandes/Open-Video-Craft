/**
 * Speech-first cleanup settings. The renderer is FFmpeg's local arnndn neural
 * denoiser, so there is no cloud call and no uploaded audio.
 */
export const AUDIO_CLEANUP_PRESETS = ["wind", "room", "steady"] as const;

export type AudioCleanupPreset = (typeof AUDIO_CLEANUP_PRESETS)[number];

export function isAudioCleanupPreset(value: unknown): value is AudioCleanupPreset {
  return AUDIO_CLEANUP_PRESETS.some((preset) => preset === value);
}

export interface AudioCleanupSettings {
  readonly preset: AudioCleanupPreset;
  readonly strength: number;
}

export type AudioCleanupState = Record<string, AudioCleanupSettings>;

export function normalizeAudioCleanupSettings(input: {
  preset?: unknown;
  strength?: unknown;
}): AudioCleanupSettings {
  const preset = isAudioCleanupPreset(input.preset) ? input.preset : "steady";
  const rawStrength = typeof input.strength === "number" && Number.isFinite(input.strength)
    ? input.strength
    : 35;
  return { preset, strength: Math.max(0, Math.min(100, Math.round(rawStrength))) };
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'").replace(/:/gu, "\\:");
}

/** Builds an FFmpeg filter fragment without changing sample rate or layout. */
export function buildAudioCleanupFilter(
  settings: AudioCleanupSettings,
  modelPath = "cb.rnnn"
): string {
  const normalized = normalizeAudioCleanupSettings(settings);
  if (normalized.strength === 0) return "anull";
  const amount = normalized.strength / 100;
  const cutoff = normalized.preset === "wind"
    ? Math.round(85 + amount * 30)
    : normalized.preset === "room"
      ? Math.round(50 + amount * 15)
      : 40;
  const mix = Math.min(1, 0.2 + amount * 1.1).toFixed(2);
  return `highpass=f=${cutoff},arnndn=m='${escapeFilterValue(modelPath)}':mix=${mix}`;
}
