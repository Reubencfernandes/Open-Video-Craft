import { describe, expect, it } from "vitest";
import { createDisplayCaptureOptions } from "../src/renderer/recording-runtime";

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
