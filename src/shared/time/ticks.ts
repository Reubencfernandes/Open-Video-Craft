/**
 * Exact integer time arithmetic for the capture pipeline.
 *
 * Rules A1 and A3 of `DATA_MODEL.md` §2: every product that involves a
 * non-tick factor (ns, sample rate, speed, timescale) is computed in `bigint`,
 * and every derived division goes through `divRound` exactly once, from
 * absolute values, never from an accumulated result. A tick is 1/705,600,000 s.
 */

/** Flicks: 1 tick = 1/705,600,000 s (DATA_MODEL §2). */
export type Ticks = bigint;
/** Integer microseconds, only ever used at the WebCodecs boundary. */
export type Micros = bigint;
/** Nanoseconds of the capture host clock, `bigint` in code and a decimal string in JSON. */
export type HostNs = bigint;

/** 705,600,000 = 2^9 · 3^2 · 5^5 · 7^2. */
export const TICKS_PER_SECOND = 705_600_000n;

/** 1 ns = 441/625 tick (0.7056). */
export const HOST_NS_TO_TICKS_NUMERATOR = 441n;
export const HOST_NS_TO_TICKS_DENOMINATOR = 625n;

/** 1 µs = 3528/5 ticks (705.6). */
export const TICKS_TO_MICROS_NUMERATOR = 5n;
export const TICKS_TO_MICROS_DENOMINATOR = 3528n;

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder !== 0n && numerator < 0n !== denominator < 0n) {
    return quotient - 1n;
  }
  return quotient;
}

/**
 * `divRound(x, d) = floorDiv(2x + d, 2d)` for `d > 0`: rounds half toward
 * +∞ without ever accumulating rounding error (rule A3).
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError(`divRound denominator must be positive, got ${denominator}`);
  }
  return floorDiv(2n * numerator + denominator, 2n * denominator);
}

/** Boundary 1: helper → importer, `ticks = divRound(ns · 441, 625)`. */
export function hostNsToTicks(hostNs: HostNs): Ticks {
  return divRound(hostNs * HOST_NS_TO_TICKS_NUMERATOR, HOST_NS_TO_TICKS_DENOMINATOR);
}

/** Boundary 3: ticks → microseconds for WebCodecs, `divRound(ticks · 5, 3528)`. */
export function ticksToMicros(ticks: Ticks): Micros {
  return divRound(ticks * TICKS_TO_MICROS_NUMERATOR, TICKS_TO_MICROS_DENOMINATOR);
}

/** Boundary 3b: microseconds → ticks, `divRound(micros · 3528, 5)`. */
export function microsToTicks(micros: Micros): Ticks {
  return divRound(micros * TICKS_TO_MICROS_DENOMINATOR, TICKS_TO_MICROS_NUMERATOR);
}
