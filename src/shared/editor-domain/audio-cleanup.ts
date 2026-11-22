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

/** Builds an FFmpeg filter fragment without changing sample rate or channel layout. */
export function buildAudioCleanupFilter(settings: AudioCleanupSettings): string {
  const normalized = normalizeAudioCleanupSettings(settings);
  if (normalized.strength === 0) return "anull";

  const amount = normalized.strength / 100;
  switch (normalized.preset) {
    case "wind": {
      // Wind rumble lives below the voice fundamentals. 80 Hz removes the rumble
      // while keeping the normal male/female speech range intact.
      const cutoff = Math.round(70 + amount * 20);
      const noiseFloor = Math.round(-34 + amount * 10);
      return `highpass=f=${cutoff},afftdn=nf=${noiseFloor}:rf=-45`;
    }
    case "room": {
      const noiseFloor = Math.round(-38 + amount * 10);
      return `afftdn=nf=${noiseFloor}:rf=-48`;
    }
    case "steady": {
      const strength = (1.5 + amount * 2.5).toFixed(2);
      return `anlmdn=s=${strength}:r=0.025`;
    }
  }
}
