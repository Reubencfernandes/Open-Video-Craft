import { describe, expect, it } from "vitest";
import {
  createScrubSeekQueue,
  getSafeMediaSeekTarget,
  getMediaTimeForTimelineTime,
  getTimelineTimeForMediaTime,
  isMediaTimePlayable,
  shouldSeekPrimaryVideo,
  shouldSeekSecondaryMedia
} from "../src/renderer/editor/playback-sync";

const clip = {
  start: 12,
  duration: 5,
  sourceStart: 30
};

describe("playback sync", () => {
  it("does not drift-seek the primary video for normal sub-tolerance clock skew", () => {
    expect(
      shouldSeekPrimaryVideo({
        reason: "tick",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 30.9,
        desiredMediaTime: 31
      })
    ).toBe(false);
  });

  it("does not hard-seek a playing primary video even when decoder progress lags", () => {
    expect(
      shouldSeekPrimaryVideo({
        reason: "tick",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 2,
        desiredMediaTime: 18
      })
    ).toBe(false);
  });

  it("seeks a playing primary video once when a tick crosses into a different clip", () => {
    // After a cut the decoder is still on the removed frames; wait for React
    // and those frames reach the screen.
    expect(
      shouldSeekPrimaryVideo({
        reason: "tick",
        isPlaying: true,
        clipChanged: true,
        canSeek: true,
        currentMediaTime: 5.02,
        desiredMediaTime: 10
      })
    ).toBe(true);
  });

  it("plays straight through a split whose next clip continues from the same frame", () => {
    expect(
      shouldSeekPrimaryVideo({
        reason: "tick",
        isPlaying: true,
        clipChanged: true,
        canSeek: true,
        currentMediaTime: 5.01,
        desiredMediaTime: 5
      })
    ).toBe(false);
    expect(
      shouldSeekPrimaryVideo({
        reason: "clip-change",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 5.01,
        desiredMediaTime: 5
      })
    ).toBe(false);
  });

  it("still seeks the primary video for explicit seeks and clip changes", () => {
    expect(
      shouldSeekPrimaryVideo({
        reason: "seek",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 30,
        desiredMediaTime: 35
      })
    ).toBe(true);

    expect(
      shouldSeekPrimaryVideo({
        reason: "clip-change",
        isPlaying: true,
        clipChanged: true,
        canSeek: true,
        currentMediaTime: 30,
        desiredMediaTime: 40
      })
    ).toBe(true);
  });

  it("does not force-seek on media-ready callbacks during playback", () => {
    expect(
      shouldSeekPrimaryVideo({
        reason: "media-ready",
        isPlaying: true,
        clipChanged: true,
        canSeek: true,
        currentMediaTime: 30,
        desiredMediaTime: 40
      })
    ).toBe(false);
  });

  it("maps media time and timeline time through the clip source offset", () => {
    expect(getMediaTimeForTimelineTime(clip, 14.5)).toBe(32.5);
    expect(getTimelineTimeForMediaTime(clip, 32.5)).toBe(14.5);
  });

  it("clamps short secondary tracks and prevents end-of-media restarts", () => {
    expect(getSafeMediaSeekTarget(10.2, 10)).toBeCloseTo(9.999);
    expect(isMediaTimePlayable(10.2, 10)).toBe(false);
    expect(isMediaTimePlayable(9.5, 10)).toBe(true);
    expect(isMediaTimePlayable(43, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("throttles secondary drift seeks while playback is running", () => {
    expect(
      shouldSeekSecondaryMedia({
        reason: "tick",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 30,
        desiredMediaTime: 31,
        nowMs: 1_000,
        lastSeekAtMs: 900
      })
    ).toBe(false);

    expect(
      shouldSeekSecondaryMedia({
        reason: "tick",
        isPlaying: true,
        clipChanged: false,
        canSeek: true,
        currentMediaTime: 30,
        desiredMediaTime: 31,
        nowMs: 1_300,
        lastSeekAtMs: 900
      })
    ).toBe(true);
  });
});

describe("scrub seek queue", () => {
  function createFakeVideo() {
    const listeners: Array<() => void> = [];
    const video = {
      seeking: false,
      currentTime: 0,
      assigned: [] as number[],
      addEventListener: (_type: "seeked", listener: () => void) => listeners.push(listener),
      /** The decoder finishes the in-flight seek. */
      land() {
        video.seeking = false;
        listeners.forEach((listener) => listener());
      }
    };
    return video;
  }

  function createQueue() {
    return createScrubSeekQueue((element, time) => {
      const video = element as ReturnType<typeof createFakeVideo>;
      video.currentTime = time;
      video.seeking = true;
      video.assigned.push(time);
      return true;
    });
  }

  it("lets each seek finish and then jumps straight to the newest pointer position", () => {
    const video = createFakeVideo();
    const queue = createQueue();

    queue.seek(video, 10);
    // Pointer keeps moving while the 10s frame decodes: none of these abort it.
    queue.seek(video, 11);
    queue.seek(video, 12);
    queue.seek(video, 13);
    expect(video.assigned).toEqual([10]);

    video.land();
    expect(video.assigned).toEqual([10, 13]);
    video.land();
    expect(video.assigned).toEqual([10, 13]);
  });

  it("drops a waiting scrub target when an explicit seek takes over", () => {
    const video = createFakeVideo();
    const queue = createQueue();

    queue.seek(video, 10);
    queue.seek(video, 20);
    queue.cancel(video);
    video.land();
    expect(video.assigned).toEqual([10]);
  });

  it("seeks immediately when the decoder is idle", () => {
    const video = createFakeVideo();
    const queue = createQueue();
    queue.seek(video, 4);
    video.land();
    queue.seek(video, 5);
    expect(video.assigned).toEqual([4, 5]);
  });
});
