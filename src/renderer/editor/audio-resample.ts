/** Mono linear resampling used before local Whisper transcription. */
export function resampleMonoTo16k(buffer: {
  readonly sampleRate: number;
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}): Float32Array {
  const source = buffer.getChannelData(0);
  if (source.length === 0 || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0) {
    return new Float32Array(0);
  }
  const outputLength = Math.max(1, Math.round(source.length * 16_000 / buffer.sampleRate));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * buffer.sampleRate / 16_000;
    const left = Math.floor(position);
    const right = Math.min(source.length - 1, left + 1);
    const fraction = position - left;
    const first = source[Math.min(left, source.length - 1)] ?? 0;
    const second = source[right] ?? first;
    output[index] = first + (second - first) * fraction;
  }
  return output;
}
