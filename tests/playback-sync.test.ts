import { describe, expect, it } from "vitest";
import {
  getMediaTimeForTimelineTime,
  getTimelineTimeForMediaTime,
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
