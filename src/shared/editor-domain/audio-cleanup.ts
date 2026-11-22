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
  modelPath = "lq.rnnn"
): string {
  const normalized = normalizeAudioCleanupSettings(settings);
  if (normalized.strength === 0) return "anull";
  const amount = normalized.strength / 100;
  const wind = normalized.preset === "wind";
  const cutoff = wind
    ? Math.round(220 + amount * 30)
    : normalized.preset === "room"
      ? Math.round(50 + amount * 15)
      : 40;
  const mix = Math.min(1, wind ? 0.8 + amount * 0.4 : 0.35 + amount * 1.3).toFixed(2);
  const denoise = `highpass=f=${cutoff},arnndn=m='${escapeFilterValue(modelPath)}':mix=${mix}`;
  return wind
    ? `${denoise},equalizer=f=2500:t=q:w=1:g=4,acompressor=threshold=-22dB:ratio=4:attack=10:release=200:makeup=3`
    : denoise;
}
