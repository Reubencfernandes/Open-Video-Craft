import { describe, expect, it } from "vitest";
import {
  resolveFfmpegPath,
  toUnpackedPath
} from "../src/main/ffmpeg";

describe("FFmpeg binaries", () => {
  it("resolves the bundled FFmpeg path", () => {
    expect(resolveFfmpegPath()).toMatch(/ffmpeg/i);
  });

  it("rewrites app.asar paths to app.asar.unpacked paths", () => {
    expect(
      toUnpackedPath(
        "/Applications/Open Video Craft.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg"
      )
    ).toBe(
      "/Applications/Open Video Craft.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
    );

    expect(
      toUnpackedPath(
        "C:\\Users\\me\\AppData\\Local\\Programs\\Open Video Craft\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe"
      )
    ).toBe(
      "C:\\Users\\me\\AppData\\Local\\Programs\\Open Video Craft\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe"
    );
  });
});
