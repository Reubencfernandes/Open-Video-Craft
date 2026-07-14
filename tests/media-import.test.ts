import { describe, expect, it } from "vitest";
import {
  getImportedMediaKind,
  getSupportedMediaExtension
} from "../src/main/media-import";

describe("media import validation", () => {
  it("accepts only supported persistence-safe extensions", () => {
    expect(getSupportedMediaExtension("Demo.MP4")).toBe("mp4");
    expect(getSupportedMediaExtension("voice.m4a")).toBe("m4a");
    expect(getSupportedMediaExtension("README")).toBeNull();
    expect(getSupportedMediaExtension("clip.ｍｐ４")).toBeNull();
    expect(getSupportedMediaExtension("archive.unknown")).toBeNull();
  });

  it("classifies supported media kinds", () => {
    expect(getImportedMediaKind("webm")).toBe("video");
    expect(getImportedMediaKind("wav")).toBe("audio");
    expect(getImportedMediaKind("png")).toBe("image");
  });
});
