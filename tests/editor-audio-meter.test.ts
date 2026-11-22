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

class FakeParam {
  value = 1;
  readonly events: Array<{ type: string; value: number; time: number }> = [];
  cancelScheduledValues(time: number): void {
    this.events.push({ type: "cancel", value: this.value, time });
  }
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: "set", value, time });
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: "ramp", value, time });
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
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
  currentTime = 0;
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

  it("schedules a fade envelope on an audio element", () => {
    const element = document.createElement("audio");
    meter.connectElement(element, 0.8);
    const context = FakeAudioContext.last;
    expect(meter.scheduleFade(element, 1, 2, 6)).toBe(true);
    const events = context?.gains[1]?.gain.events ?? [];
    expect(events.some((event) => event.type === "set" && event.value === 0 && event.time === 0)).toBe(true);
    expect(events.some((event) => event.type === "ramp" && event.value === 0.8 && event.time === 1)).toBe(true);
    expect(events.some((event) => event.type === "ramp" && event.value === 0 && event.time === 6)).toBe(true);
  });

  it("keeps the Web Audio graph clean; denoise happens in the rendered source", () => {
    const element = document.createElement("video");
    expect(meter.connectElement(element, 1)).toBe(true);
    const context = FakeAudioContext.last;
    expect(context?.biquads).toHaveLength(0);
    expect(context?.sources[0]?.connections[0]).toBe(context?.gains[1]);
  });
});
