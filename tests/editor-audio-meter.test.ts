// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AudioMeter } from "../src/renderer/editor/audio-meter";

class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(target: FakeNode): void {
    this.connections.push(target);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

class FakeGain extends FakeNode {
  gain = { value: 1 };
}

class FakeBiquad extends FakeNode {
  type = "lowpass";
  frequency = { value: 0 };
  gain = { value: 0 };
}

class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  getFloatTimeDomainData(): void { return; }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  readonly biquads: FakeBiquad[] = [];
  readonly gains: FakeGain[] = [];
  readonly sources: FakeNode[] = [];
  state: "running" | "suspended" = "running";
  destination = new FakeNode();

  constructor() {
    FakeAudioContext.last = this;
  }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser();
  }
  createMediaElementSource(): FakeNode {
    const source = new FakeNode();
    this.sources.push(source);
    return source;
  }
  createBiquadFilter(): FakeBiquad {
    const filter = new FakeBiquad();
    this.biquads.push(filter);
    return filter;
  }
  async resume(): Promise<void> { return; }
  async close(): Promise<void> { return; }
}

describe("editor AudioMeter cleanup preview", () => {
  let meter: AudioMeter;

  beforeEach(() => {
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
    FakeAudioContext.last = null;
    meter = new AudioMeter();
  });

  afterEach(() => meter.dispose());

  it("keeps the Web Audio graph clean; denoise happens in the rendered source", () => {
    const element = document.createElement("video");
    expect(meter.connectElement(element, 1)).toBe(true);
    const context = FakeAudioContext.last;
    expect(context?.biquads).toHaveLength(0);
    expect(context?.sources[0]?.connections[0]).toBe(context?.gains[1]);
  });
});
