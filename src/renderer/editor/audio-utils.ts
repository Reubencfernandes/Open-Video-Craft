// Volume is stored internally as a linear percentage (100 = unity gain) so that
// saved projects stay backward compatible, but the UI presents and edits it in
// decibels. 0 dB is unity; positive dB boosts above unity, which only the Web
// Audio graph (not a plain media element) can reproduce during preview.

export const minVolumeDb = -40;
export const maxVolumeDb = 12;

export function linearPercentToDb(percent: number): number {
  if (percent <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return 20 * Math.log10(percent / 100);
}

export function dbToLinearPercent(db: number): number {
  return Math.round(100 * 10 ** (db / 20));
}

/** The dB value shown on a slider, clamped to the control's range. */
export function percentToSliderDb(percent: number): number {
  if (percent <= 0) {
    return minVolumeDb;
  }

  return Math.max(minVolumeDb, Math.min(maxVolumeDb, Math.round(linearPercentToDb(percent))));
}

export function formatDb(percent: number): string {
  if (percent <= 0) {
    return "-∞ dB";
  }

  const db = linearPercentToDb(percent);
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)} dB`;
}
