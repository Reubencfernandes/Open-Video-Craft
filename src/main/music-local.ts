const SAMPLE_RATE = 44_100;
const DEFAULT_DURATION_SECONDS = 30;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 180;

export interface LocalMusicInput {
  readonly prompt: string;
  readonly lyrics?: string;
  readonly durationSeconds?: number;
}

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function oscillator(frequency: number, time: number, detune = 0): number {
  const phase = 2 * Math.PI * frequency * time + detune;
  return Math.sin(phase) + 0.28 * Math.sin(phase * 2);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function writeWavHeader(buffer: Buffer, sampleCount: number): void {
  const dataBytes = sampleCount * 2;
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
}

/** Deterministic key-free music rendering used by the Claude Max assistant. */
export function renderLocalMusic(input: LocalMusicInput): Buffer {
  const seed = hashText(`${input.prompt.trim()}\n${input.lyrics?.trim() ?? ""}`);
  const duration = clamp(
    Number.isFinite(input.durationSeconds) ? input.durationSeconds ?? DEFAULT_DURATION_SECONDS : DEFAULT_DURATION_SECONDS,
    MIN_DURATION_SECONDS,
    MAX_DURATION_SECONDS
  );
  const tempo = 72 + (seed % 49);
  const beat = 60 / tempo;
  const bar = beat * 4;
  const root = 48 + ((seed >>> 8) % 12);
  const progressions = [
    [0, 5, 3, 4],
    [0, 3, 5, 4],
    [0, 4, 5, 3]
  ];
  const progression = progressions[(seed >>> 16) % progressions.length] ?? progressions[0];
  const minor = ((seed >>> 24) & 1) === 1;
  const third = minor ? 3 : 4;
  const sampleCount = Math.round(SAMPLE_RATE * duration);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  writeWavHeader(buffer, sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const barIndex = Math.floor(time / bar);
    const degree = progression[barIndex % progression.length] ?? 0;
    const chordRoot = root + degree;
    const beatPhase = (time % beat) / beat;
    const chordEnvelope = 0.35 + 0.65 * Math.exp(-1.6 * beatPhase);
    const chord =
      oscillator(midiToFrequency(chordRoot), time) +
      oscillator(midiToFrequency(chordRoot + third), time, 0.4) +
      oscillator(midiToFrequency(chordRoot + 7), time, 0.8);
    const bass = oscillator(midiToFrequency(chordRoot - 12), time) * Math.exp(-2.2 * beatPhase);
    const arpStep = Math.floor(time / (beat / 2)) % 3;
    const arpNote = chordRoot + 12 + [0, third, 7][arpStep]!;
    const arpPhase = (time % (beat / 2)) / (beat / 2);
    const arp = oscillator(midiToFrequency(arpNote), time) * Math.exp(-5 * arpPhase);
    const fade = Math.min(1, time / 0.5, (duration - time) / 0.5);
    const sample = clamp((chord * 0.12 * chordEnvelope + bass * 0.18 + arp * 0.08) * fade, -0.95, 0.95);
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return buffer;
}
