/** Pure microphone level analysis used by the recorder preview meter. */

export interface AudioLevel {
  /** 0..1 root-mean-square level. */
  readonly rms: number;
  /** 0..100 display percentage. */
  readonly percent: number;
  /** True when the signal is strong enough to show the active state. */
  readonly active: boolean;
}

export function analyzeAudioSamples(samples: Int16Array | Float32Array, floorDb = -60): AudioLevel {
  if (samples.length === 0) return { rms: 0, percent: 0, active: false };
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const raw = samples[index];
    const normalized = samples.constructor === Float32Array
      ? raw
      : raw / 32_768;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const minAmplitude = 10 ** (floorDb / 20);
  const db = rms <= 0 ? floorDb : Math.max(floorDb, 20 * Math.log10(rms));
  const percent = Math.round(((db - floorDb) / -floorDb) * 100);
  return {
    rms,
    percent: Math.max(0, Math.min(100, percent)),
    active: rms >= minAmplitude
  };
}

/** Smoother display value that falls faster than it rises, like a VU meter. */
export function smoothMeterLevel(previous: number, next: number): number {
  const coefficient = next > previous ? 0.55 : 0.18;
  return Math.max(0, Math.min(100, previous + (next - previous) * coefficient));
}
