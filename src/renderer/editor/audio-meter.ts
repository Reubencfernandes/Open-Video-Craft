/** Live preview audio graph and peak meter. */
type ElementAudioNodes = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  baseVolume: number;
};

export class AudioMeter {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private readonly elements = new Map<HTMLMediaElement, ElementAudioNodes>();
  private masterVolume = 1;

  connectElement(element: HTMLMediaElement, volume: number): boolean {
    const existing = this.elements.get(element);
    if (existing) {
      existing.baseVolume = sanitizeGain(volume);
      existing.gain.gain.value = existing.baseVolume;
      return true;
    }

    const context = this.ensureContext();
    if (!context || !this.masterGain) return false;

    try {
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      const baseVolume = sanitizeGain(volume);
      gain.gain.value = baseVolume;
      source.connect(gain);
      gain.connect(this.masterGain);
      this.elements.set(element, { source, gain, baseVolume });
      return true;
    } catch {
      return false;
    }
  }

  setElementGain(element: HTMLMediaElement, volume: number): boolean {
    return this.connectElement(element, volume);
  }

  scheduleFade(
    element: HTMLMediaElement,
    fadeIn: number,
    fadeOut: number,
    duration: number
  ): boolean {
    const nodes = this.elements.get(element);
    if (!nodes || !this.context) return false;
    const now = this.context.currentTime;
    const gain = nodes.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(nodes.baseVolume, now);
    if (fadeIn > 0) {
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(nodes.baseVolume, now + Math.min(fadeIn, duration / 2));
    }
    if (fadeOut > 0) {
      const start = now + Math.max(fadeIn, duration - fadeOut);
      gain.setValueAtTime(nodes.baseVolume, start);
      gain.linearRampToValueAtTime(0, now + duration);
    }
    return true;
  }

  setMasterGain(volume: number): void {
    this.masterVolume = sanitizeGain(volume);
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  async resume(): Promise<void> {
    const context = this.ensureContext();
    if (context?.state === "suspended") await context.resume();
  }

  sample(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }

  dispose(): void {
    for (const { source, gain } of this.elements.values()) {
      source.disconnect();
      gain.disconnect();
    }
    this.elements.clear();
    this.masterGain?.disconnect();
    this.analyser?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.masterGain = null;
    this.analyser = null;
    this.samples = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      const context = new AudioContextCtor();
      const masterGain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      masterGain.gain.value = this.masterVolume;
      masterGain.connect(analyser);
      analyser.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
      this.analyser = analyser;
      this.samples = new Float32Array(analyser.fftSize);
      return context;
    } catch {
      return null;
    }
  }
}

function sanitizeGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 1;
}
