/**
 * Conservative speech-first cleanup settings.
 *
 * These filters are applied locally by FFmpeg during export. They intentionally
 * avoid low-pass filtering or heavy compression so speech clarity is preserved.
 * Strength is a 0..100 UI value mapped to a narrow, safe parameter range.
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

export interface AudioCleanupPreviewSettings {
  readonly highpassHz: number;
  readonly lowShelfHz: number;
  readonly lowShelfGainDb: number;
  readonly noiseStrength: number;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Web Audio approximation used by preview; mirrors the export filter intent. */
export function getAudioCleanupPreviewSettings(
  settings: AudioCleanupSettings
): AudioCleanupPreviewSettings | null {
  const normalized = normalizeAudioCleanupSettings(settings);
  if (normalized.strength === 0) return null;
  const amount = normalized.strength / 100;
  switch (normalized.preset) {
    case "wind":
      return {
        highpassHz: Math.round(75 + amount * 10),
        lowShelfHz: 200,
        lowShelfGainDb: -roundTenth(2 + amount * 4),
        noiseStrength: roundTenth(0.6 + amount)
      };
    case "room":
      return {
        highpassHz: Math.round(55 + amount * 10),
        lowShelfHz: 250,
        lowShelfGainDb: -roundTenth(1.5 + amount * 3.5),
        noiseStrength: roundTenth(0.5 + amount * 1.3)
      };
    case "steady":
      return {
        highpassHz: 40,
        lowShelfHz: 200,
        lowShelfGainDb: 0,
        noiseStrength: roundTenth(1 + amount * 2.5)
      };
  }
}

/** Builds an FFmpeg filter fragment without changing sample rate or channel layout. */
export function buildAudioCleanupFilter(settings: AudioCleanupSettings): string {
  const preview = getAudioCleanupPreviewSettings(settings);
  if (!preview) return "anull";
  const shelf = preview.lowShelfGainDb === 0
    ? ""
    : `,lowshelf=f=${preview.lowShelfHz}:g=${preview.lowShelfGainDb}:w=0.7`;
  const rate = settings.preset === "steady" ? "0.025" : "0.01";
  return `highpass=f=${preview.highpassHz}${shelf},anlmdn=s=${preview.noiseStrength}:r=${rate}`;
}
