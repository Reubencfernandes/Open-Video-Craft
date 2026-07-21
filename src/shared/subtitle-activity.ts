export type SubtitleActivityRange = { start: number; end: number };

/** Invert detected silence into the likely speech intervals used for placeholders. */
export function createSubtitleActivityRangesFromSilence(
  duration: number,
  silenceRanges: SubtitleActivityRange[]
): SubtitleActivityRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const maximum = Math.max(0, duration);
  const ordered = silenceRanges
    .map((range) => ({
      start: Math.max(0, Math.min(maximum, range.start)),
      end: Math.max(0, Math.min(maximum, range.end))
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const activity: SubtitleActivityRange[] = [];
  let cursor = 0;

  for (const silence of ordered) {
    if (silence.start - cursor >= 0.18) {
      activity.push({ start: cursor, end: silence.start });
    }
    cursor = Math.max(cursor, silence.end);
  }
  if (maximum - cursor >= 0.18) activity.push({ start: cursor, end: maximum });
  return mergeNearbyActivityRanges(activity, 0.16);
}

/** Lightweight RMS activity detection for the decoded 16 kHz Whisper mix. */
export function detectSubtitleActivityRanges(
  samples: Float32Array,
  sampleRate = 16_000
): SubtitleActivityRange[] {
  if (samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return [];
  const frameSeconds = 0.08;
  const frameSize = Math.max(1, Math.round(sampleRate * frameSeconds));
  const levels: number[] = [];

  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    let energy = 0;
    for (let index = offset; index < end; index += 1) {
      energy += samples[index] * samples[index];
    }
    levels.push(Math.sqrt(energy / Math.max(1, end - offset)));
  }

  const peak = Math.max(0, ...levels);
  if (peak < 0.004) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.3)] ?? 0;
  const threshold = Math.max(0.006, noiseFloor * 2.4, peak * 0.12);
  const allowedGapFrames = Math.max(1, Math.round(0.42 / frameSeconds));
  const ranges: SubtitleActivityRange[] = [];
  let startFrame: number | null = null;
  let lastActiveFrame = -1;

  for (let frame = 0; frame < levels.length; frame += 1) {
    if (levels[frame] >= threshold) {
      startFrame ??= frame;
      lastActiveFrame = frame;
      continue;
    }
    if (startFrame !== null && frame - lastActiveFrame > allowedGapFrames) {
      pushFrameRange(ranges, startFrame, lastActiveFrame, frameSeconds, samples.length / sampleRate);
      startFrame = null;
    }
  }
  if (startFrame !== null) {
    pushFrameRange(ranges, startFrame, lastActiveFrame, frameSeconds, samples.length / sampleRate);
  }
  return mergeNearbyActivityRanges(ranges, 0.2).slice(0, 240);
}

function pushFrameRange(
  ranges: SubtitleActivityRange[],
  startFrame: number,
  endFrame: number,
  frameSeconds: number,
  duration: number
): void {
  const start = Math.max(0, startFrame * frameSeconds - 0.12);
  const end = Math.min(duration, (endFrame + 1) * frameSeconds + 0.16);
  if (end - start >= 0.18) ranges.push({ start, end });
}

function mergeNearbyActivityRanges(
  ranges: SubtitleActivityRange[],
  maximumGap: number
): SubtitleActivityRange[] {
  const merged: SubtitleActivityRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start - previous.end <= maximumGap) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
