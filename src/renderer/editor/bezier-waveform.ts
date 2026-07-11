type Point = { x: number; y: number };

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothCurve(points: Point[]) {
  if (points.length < 2) return "";

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1 = {
      x: current.x + (next.x - before.x) / 6,
      y: current.y + (next.y - before.y) / 6
    };
    const control2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6
    };
    path += ` C ${control1.x.toFixed(1)} ${control1.y.toFixed(1)}, ${control2.x.toFixed(1)} ${control2.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
}

/**
 * Creates a deterministic, smoothly interpolated cubic-Bézier audio shape.
 * `amplitudeScale` lets the timeline react to the user's gain without changing
 * the seeded peaks, so moving a dB control never makes the waveform jump.
 */
export function createBezierWaveform(
  seedValue: string,
  width = 1000,
  height = 36,
  amplitudeScale = 1
) {
  const random = createRandom(hashSeed(seedValue));
  const center = height / 2;
  const segments = 18;
  const upper: Point[] = [];
  const safeScale = Math.max(0, Math.min(1, amplitudeScale));

  for (let index = 0; index <= segments; index += 1) {
    const edgeFade = Math.sin((index / segments) * Math.PI);
    const amplitude =
      (3.5 + random() * (center - 5)) * (0.35 + edgeFade * 0.65) * safeScale;
    upper.push({ x: (index / segments) * width, y: center - amplitude });
  }

  const lower = upper
    .map((point) => ({ x: point.x, y: center + (center - point.y) }))
    .reverse();

  return `${smoothCurve(upper)} L ${lower[0].x.toFixed(1)} ${lower[0].y.toFixed(1)} ${smoothCurve(lower).replace(/^M [^C]+/, "")} Z`;
}

export function createBezierWaveLine(
  seedValue: string,
  width = 1000,
  height = 36,
  amplitudeScale = 1
) {
  const random = createRandom(hashSeed(`${seedValue}-line`));
  const safeScale = Math.max(0, Math.min(1, amplitudeScale));
  const points: Point[] = Array.from({ length: 19 }, (_, index) => ({
    x: (index / 18) * width,
    y: height / 2 + (random() - 0.5) * height * 0.38 * safeScale
  }));
  return smoothCurve(points);
}
