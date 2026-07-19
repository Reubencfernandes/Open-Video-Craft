import type { AudioLevelState } from "./types";

const defaultAudioLevel = { volume: 100, muted: false } as const;

/** Persisted audio-level key owned by one semantic audio timeline lane. */
export function getAudioLaneLevelKey(lane: number): string {
  return `audio-lane:${Math.max(0, Math.floor(lane))}`;
}

/**
 * Resolve the audible state of one timeline clip. Source controls remain
 * global, while a lane mute only affects clips placed on that lane.
 */
export function getEffectiveAudioLevel(
  audioLevels: AudioLevelState,
  itemId: string,
  lane: number | null = null
): { volume: number; muted: boolean } {
  const source = audioLevels[itemId] ?? defaultAudioLevel;
  if (lane === null) {
    return { volume: source.volume, muted: source.muted };
  }

  const laneLevel = audioLevels[getAudioLaneLevelKey(lane)] ?? defaultAudioLevel;
  return {
    volume: (source.volume * laneLevel.volume) / 100,
    muted: source.muted || laneLevel.muted
  };
}
