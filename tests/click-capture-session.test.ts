import { describe, expect, it } from "vitest";

import {
  buildClickCaptureArgs,
  resolveClickCaptureExecutable
} from "../src/main/click-capture-session";

describe("click capture executable resolution", () => {
  it("uses the packaged Resources copy in a built app", () => {
    expect(
      resolveClickCaptureExecutable({
        isPackaged: true,
        resourcesPath: "/Applications/Open Video Craft.app/Contents/Resources",
        repoRoot: "/repo"
      })
    ).toBe("/Applications/Open Video Craft.app/Contents/Resources/bin/ovc-click-capture");
  });

  it("uses the Swift build output during development", () => {
    expect(
      resolveClickCaptureExecutable({
        isPackaged: false,
        resourcesPath: "/ignored",
        repoRoot: "/repo"
      })
    ).toBe("/repo/native/capture-poc/.build/release/ovc-click-capture");
  });
});

describe("click capture arguments", () => {
  it("restricts capture to the recorded display", () => {
    expect(buildClickCaptureArgs("69732963")).toEqual(["--display", "69732963"]);
  });

  it("captures every display when none is selected", () => {
    expect(buildClickCaptureArgs(null)).toEqual([]);
    expect(buildClickCaptureArgs("")).toEqual([]);
  });
});
