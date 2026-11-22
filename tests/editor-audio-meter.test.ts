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

  it("routes media through high-pass and low-shelf filters when cleanup is enabled", () => {
    const element = document.createElement("video");
    expect(meter.connectElement(element, 1, { preset: "wind", strength: 50 })).toBe(true);
    const context = FakeAudioContext.last;
    expect(context).not.toBeNull();
    const source = context?.sources[0];
    const highpass = context?.biquads[0];
    const shelf = context?.biquads[1];
    expect(source?.connections[0]).toBe(highpass);
    expect(highpass?.type).toBe("highpass");
    expect(highpass?.frequency.value).toBe(80);
    expect(shelf?.type).toBe("lowshelf");
    expect(shelf?.frequency.value).toBe(200);
    expect(shelf?.gain.value).toBe(-4);
  });

  it("removes the filters when cleanup is disabled", () => {
    const element = document.createElement("video");
    meter.connectElement(element, 1, { preset: "wind", strength: 50 });
    const context = FakeAudioContext.last;
    expect(meter.setElementCleanup(element, null)).toBe(true);
    const source = context?.sources[0];
    const elementGain = context?.gains[1];
    expect(source?.connections).toHaveLength(1);
    expect(source?.connections[0]).toBe(elementGain);
  });
});
