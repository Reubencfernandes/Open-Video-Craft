// Drives the Audio tool's live output meter.
//
// Instead of tapping the live media elements through Web Audio (which is
// fragile: it depends on CORS, one-shot MediaElementSource nodes, and an
// AudioContext that must be resumed on a gesture), each audio clip is decoded
// once into a small peak envelope. The meter then samples that envelope at the
// current playback position and scales it by the clip's effective gain, so it
// reflects both the real audio content and the user's dB settings.

export class AudioMeter {
  private context: AudioContext | null = null;
  private readonly envelopes = new Map<string, Float32Array>();
  private readonly pending = new Set<string>();
  private readonly bucketsPerSecond = 50;

  /** Kick off decoding an audio URL's envelope if it isn't ready or in flight. */
  ensureEnvelope(url: string): void {
    if (!url || this.envelopes.has(url) || this.pending.has(url)) {
      return;
    }

    this.pending.add(url);
    void this.decodeEnvelope(url)
      .catch(() => undefined)
      .finally(() => this.pending.delete(url));
  }

  /** Peak magnitude (0..1) of the source audio at `sourceTime` seconds. */
  sample(url: string, sourceTime: number): number {
    const envelope = this.envelopes.get(url);
    if (!envelope) {
      return 0;
    }

    const index = Math.floor(sourceTime * this.bucketsPerSecond);
    if (index < 0 || index >= envelope.length) {
      return 0;
    }
    return envelope[index];
  }

  dispose(): void {
    if (this.context) {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.envelopes.clear();
    this.pending.clear();
  }

  private getContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      // decodeAudioData works on a suspended context, so it never needs to run.
      this.context = new AudioContextCtor();
      return this.context;
    } catch {
      return null;
    }
  }

  private async decodeEnvelope(url: string): Promise<void> {
    const context = this.getContext();
    if (!context) {
      return;
    }

    const response = await fetch(url);
    if (!response.ok) {
      return;
    }

    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    const bucketCount = Math.max(1, Math.ceil(decoded.duration * this.bucketsPerSecond));
    const envelope = new Float32Array(bucketCount);
    const samplesPerBucket = Math.max(1, Math.floor(decoded.sampleRate / this.bucketsPerSecond));

    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const bucket = Math.min(bucketCount - 1, Math.floor(index / samplesPerBucket));
        const magnitude = Math.abs(data[index]);
        if (magnitude > envelope[bucket]) {
          envelope[bucket] = magnitude;
        }
      }
    }

    this.envelopes.set(url, envelope);
  }
}
