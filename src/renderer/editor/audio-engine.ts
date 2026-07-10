// A minimal Web Audio graph laid over the preview media elements. It exists for
// two things a plain <audio>/<video> element cannot do:
//
//   1. Gain above unity (dB boost) — a media element's own `volume` maxes at 1.
//   2. A live output level for the meter (via an AnalyserNode on the mix bus).
//
// Each element is routed source -> per-element gain -> master bus -> analyser ->
// destination. The element's own `volume` still applies attenuation (<= 1) so
// audio keeps working even if a particular element cannot be attached; the gain
// node only ever adds the >1 boost on top.
//
// Attaching is best-effort and guarded: createMediaElementSource throws if the
// element is already bound, and the elements opt into CORS (crossOrigin) so the
// custom-protocol media stays audible through the graph instead of muting.

const analyserFftSize = 1024;

export class EditorAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly nodes = new WeakMap<HTMLMediaElement, GainNode>();
  private timeData = new Uint8Array(analyserFftSize);
  private failed = false;

  private ensureContext(): boolean {
    if (this.context) {
      return true;
    }
    if (this.failed) {
      return false;
    }

    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        this.failed = true;
        return false;
      }

      const context = new AudioContextCtor();
      const masterGain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = analyserFftSize;
      analyser.smoothingTimeConstant = 0.55;
      masterGain.connect(analyser);
      analyser.connect(context.destination);

      this.context = context;
      this.masterGain = masterGain;
      this.analyser = analyser;
      this.timeData = new Uint8Array(analyser.fftSize);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Resume after a user gesture (browsers start the context suspended). */
  resume(): void {
    if (!this.ensureContext()) {
      return;
    }
    void this.context?.resume().catch(() => undefined);
  }

  attach(element: HTMLMediaElement): void {
    if (this.nodes.has(element) || !this.ensureContext() || !this.context || !this.masterGain) {
      return;
    }

    try {
      const source = this.context.createMediaElementSource(element);
      const gain = this.context.createGain();
      source.connect(gain);
      gain.connect(this.masterGain);
      this.nodes.set(element, gain);
    } catch {
      // Already bound to another source, or the element cannot be captured.
    }
  }

  /** Sets the >1 boost applied on top of the element's own `volume`. */
  setBoost(element: HTMLMediaElement, boost: number): void {
    const gain = this.nodes.get(element);
    if (gain) {
      gain.gain.value = Math.max(0, boost);
    }
  }

  /** Peak output level (0..1) of the whole mix, for the level meter. */
  getLevel(): number {
    if (!this.analyser) {
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.timeData);
    let peak = 0;
    for (let index = 0; index < this.timeData.length; index += 1) {
      const magnitude = Math.abs(this.timeData[index] - 128) / 128;
      if (magnitude > peak) {
        peak = magnitude;
      }
    }
    return peak;
  }

  dispose(): void {
    if (this.context) {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.masterGain = null;
    this.analyser = null;
  }
}
