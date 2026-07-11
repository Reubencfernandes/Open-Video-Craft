/**
 * Speed effect constants and the active-rate lookup used by playback.
 */
import type { SpeedEffect, SpeedRate } from "./types";

export const speedRates = [1, 2, 3, 4, 5] as const satisfies SpeedRate[];
export const defaultSpeedRate: SpeedRate = 2;
export const speedMinDurationSeconds = 0.2;

export function getActiveSpeedRate(effects: SpeedEffect[], time: number): SpeedRate {
  return (
    effects.find((effect) => time >= effect.start && time < effect.end)?.rate ??
    1
  );
}

export function isSpeedRate(value: number): value is SpeedRate {
  return speedRates.includes(value as SpeedRate);
}
