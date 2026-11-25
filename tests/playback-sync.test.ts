import { describe, expect, it } from "vitest";

import { isContiguousAudioCut, shouldSeekPrimaryVideo } from "../src/renderer/editor/playback-sync";
import { coalesceAudioSegments, groupVideoAudioPieces } from "../src/main/ffmpeg";
import type { TimelineMediaClip } from "../src/renderer/editor/types";

function audioClip(
  id: string,
  start: number,
  duration: number,
  sourceStart: number,
  itemId = "mic"
): TimelineMediaClip {
  return {
    id,
    item: { id: itemId, name: itemId, url: itemId, kind: "audio", origin: "project", track: "audio", duration: 10 },
    track: "audio",
    lane: 0,
    start,
    duration,
    sourceStart
  };
}

describe("contiguous split playback", () => {
  it("keeps two halves of one audio source playing through the cut", () => {
    expect(isContiguousAudioCut(audioClip("a", 0, 1.2345, 0), audioClip("b", 1.2345, 1, 1.2345))).toBe(true);
  });

  it("does not bridge a different source, a gap or a retimed source", () => {
    const first = audioClip("a", 0, 1, 0);
    expect(isContiguousAudioCut(first, audioClip("b", 1, 1, 1, "other"))).toBe(false);
    expect(isContiguousAudioCut(first, audioClip("b", 1.01, 1, 1))).toBe(false);
    expect(isContiguousAudioCut(first, audioClip("b", 1, 1, 2))).toBe(false);
  });

  it("coalesces contiguous export audio into one decoded input", () => {
    const merged = coalesceAudioSegments([
      { path: "/voice.wav", start: 0, end: 1.2345, sourceStart: 0, volume: 1 },
      { path: "/voice.wav", start: 1.2345, end: 2.5, sourceStart: 1.2345, volume: 1 }
    ]);
    expect(merged).toEqual([
      { path: "/voice.wav", start: 0, end: 2.5, sourceStart: 0, volume: 1 }
    ]);
  });

  it("groups video-piece audio across a cut without splitting the decoder", () => {
    const piece = (id: string, start: number, duration: number, sourceStart: number) => ({
      inputIndex: 0,
      duration,
      gap: false,
      segment: {
        id,
        path: "/screen.mp4",
        kind: "video" as const,
        start,
        end: start + duration,
        sourceStart,
        volume: 1,
        hasAudio: true
      }
    });
    const groups = groupVideoAudioPieces(
      [piece("a", 0, 1.2345, 0), piece("b", 1.2345, 1, 1.2345)],
      []
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].start).toBe(0);
    expect(groups[0].duration).toBeCloseTo(2.2345, 6);
    expect(groups[0].sourceStart).toBe(0);
  });

  it("preserves deliberate fades, volume changes and real source changes", () => {
    const first = { path: "/voice.wav", start: 0, end: 1, sourceStart: 0, volume: 1 };
    expect(coalesceAudioSegments([first, { ...first, start: 1, end: 2, sourceStart: 1, fadeIn: 0.2 }])).toHaveLength(2);
    expect(coalesceAudioSegments([first, { ...first, start: 1, end: 2, sourceStart: 1, volume: 0.5 }])).toHaveLength(2);
    expect(coalesceAudioSegments([first, { ...first, path: "/other.wav", start: 1, end: 2, sourceStart: 0 }])).toHaveLength(2);
  });
});

describe("primary video seeks at clip changes", () => {
  const base = {
    reason: "clip-change" as const,
    isPlaying: true,
    clipChanged: true,
    canSeek: true
  };

  it("skips the seek when the next clip continues from the current frame", () => {
    expect(
      shouldSeekPrimaryVideo({ ...base, currentMediaTime: 2, desiredMediaTime: 2.004 })
    ).toBe(false);
  });

  it("still seeks when the next clip starts at a different source position", () => {
    expect(
      shouldSeekPrimaryVideo({ ...base, currentMediaTime: 0, desiredMediaTime: 6.5 })
    ).toBe(true);
  });

  it("still seeks when the decoder has drifted away from the cut", () => {
    expect(
      shouldSeekPrimaryVideo({ ...base, currentMediaTime: 2, desiredMediaTime: 2.8 })
    ).toBe(true);
  });

  it("seeks a paused decoder onto the new clip", () => {
    expect(
      shouldSeekPrimaryVideo({ ...base, isPlaying: false, currentMediaTime: 2, desiredMediaTime: 2.004 })
    ).toBe(true);
  });
});
