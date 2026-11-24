import { describe, expect, it } from "vitest";
import {
  createDisplayCaptureOptions,
  createMediaRecorderOptions
} from "../src/renderer/recording-runtime";

describe("media recorder options", () => {
  it("asks for a keyframe every second so the editor can seek recordings quickly", () => {
    // Chromium's default is roughly one keyframe every 3–4 s, and every seek
    // must decode forward from the previous keyframe, so scrubbing stalls.
    expect(createMediaRecorderOptions("video", "video/webm;codecs=vp9", 24_000_000)).toEqual({
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 24_000_000,
      videoKeyFrameIntervalDuration: 1_000
    });
  });

  it("leaves audio recorders without video encoder options", () => {
    expect(createMediaRecorderOptions("audio", "audio/webm;codecs=opus")).toEqual({
      audioBitsPerSecond: 128_000,
      mimeType: "audio/webm;codecs=opus"
    });
  });
});

describe("display capture options", () => {
  it("requests a native-resolution video stream without system audio by default", () => {
    const options = createDisplayCaptureOptions(false);

    expect(options.audio).toBe(false);
    expect(options.video).toEqual({ frameRate: 30 });
  });

  it("uses the same standards-based capture path for optional desktop audio and downscaling", () => {
    const options = createDisplayCaptureOptions(true, 1080);

    expect(options.audio).toBe(true);
    expect(options.video).toEqual({
      frameRate: 30,
      height: { ideal: 1080 }
    });
  });
});
