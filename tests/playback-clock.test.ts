import { describe, expect, it } from "vitest";
import { resolveNextTimelineTime } from "../src/renderer/editor/playback-clock";

const clip = { start: 10, duration: 5, sourceStart: 30 };

describe("playback clock", () => {
  it("uses decoder media time as the authoritative video timeline clock", () => {
    expect(
      resolveNextTimelineTime({
        currentTime: 11,
        elapsedSeconds: 0.1,
        playbackRate: 1,
        videoClock: { clip, mediaTime: 31.4, ready: true, ended: false }
      })
    ).toBeCloseTo(11.4);
  });

  it("holds the timeline while the decoder is seeking or buffering", () => {
    expect(
      resolveNextTimelineTime({
        currentTime: 11,
        elapsedSeconds: 0.1,
        playbackRate: 1,
        videoClock: { clip, mediaTime: 31.4, ready: false, ended: false }
      })
    ).toBe(11);
  });

  it("uses elapsed time for images and intentional timeline gaps", () => {
    expect(
      resolveNextTimelineTime({
        currentTime: 11,
        elapsedSeconds: 0.1,
        playbackRate: 2,
        videoClock: null
      })
    ).toBeCloseTo(11.2);
  });

  it("never jumps backwards for a stale decoder frame", () => {
    expect(
      resolveNextTimelineTime({
        currentTime: 12,
        elapsedSeconds: 0.1,
        playbackRate: 1,
        videoClock: { clip, mediaTime: 31.5, ready: true, ended: false }
      })
    ).toBe(12);
  });

  it("advances to the clip boundary when a slightly shorter primary track ends", () => {
    expect(
      resolveNextTimelineTime({
        currentTime: 14.98,
        elapsedSeconds: 0.1,
        playbackRate: 1,
        videoClock: { clip, mediaTime: 34.98, ready: false, ended: true }
      })
    ).toBe(15);
  });
});
