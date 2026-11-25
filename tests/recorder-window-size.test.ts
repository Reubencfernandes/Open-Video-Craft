import { describe, expect, it } from "vitest";

import { getExpandedRecorderWindowSize } from "../src/main/recorder-window-size";

describe("recorder expanded window size", () => {
  it("uses a large default so the source grid and webcam cards fit without scrolling", () => {
    expect(getExpandedRecorderWindowSize({ width: 1920, height: 1080 })).toEqual({
      width: 1000,
      height: 1032
    });
  });

  it("stays inside a smaller work area", () => {
    expect(getExpandedRecorderWindowSize({ width: 900, height: 700 })).toEqual({
      width: 852,
      height: 652
    });
  });

  it("never becomes smaller than the previous compact-friendly size", () => {
    expect(getExpandedRecorderWindowSize({ width: 500, height: 500 })).toEqual({
      width: 460,
      height: 460
    });
  });
});
