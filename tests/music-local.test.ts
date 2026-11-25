import { describe, expect, it } from "vitest";
import { renderLocalMusic } from "../src/main/music-local";

describe("renderLocalMusic", () => {
  it("writes a valid PCM WAV with audible samples", () => {
    const wav = renderLocalMusic({ prompt: "mellow lo-fi piano", durationSeconds: 2 });
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt16LE(32)).toBe(2);
    expect(wav.length).toBe(44 + 2 * 44_100 * 5);

    let peak = 0;
    for (let offset = 44; offset < wav.length; offset += 2) {
      peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
    }
    expect(peak).toBeGreaterThan(1_000);
    expect(peak).toBeLessThan(32_768);
  });

  it("is deterministic for the same prompt and changes with the prompt", () => {
    const first = renderLocalMusic({ prompt: "bright acoustic groove", durationSeconds: 1 });
    const second = renderLocalMusic({ prompt: "bright acoustic groove", durationSeconds: 1 });
    const other = renderLocalMusic({ prompt: "dark ambient drone", durationSeconds: 1 });
    expect(first.equals(second)).toBe(true);
    expect(first.equals(other)).toBe(false);
  });

  it("clamps the requested duration", () => {
    const short = renderLocalMusic({ prompt: "test", durationSeconds: 0 });
    expect(short.length).toBe(44 + 2 * 44_100 * 5);
  });
});
