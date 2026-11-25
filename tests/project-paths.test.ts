import { describe, expect, it } from "vitest";
import {
  createRecordingTrackId,
  createWavTrackId,
  getMediaTrackRelativePath,
  getRecordingKindForTrackId,
  parseMediaTrackKey,
  recordingTrackToMediaTrack
} from "../src/main/project-paths";

describe("recording track ids", () => {
  it("keeps the first track of every kind on the legacy media track id", () => {
    expect(createRecordingTrackId("screen", 0)).toBe("screen");
    expect(createRecordingTrackId("camera", 0)).toBe("camera");
    expect(createRecordingTrackId("mic", 0)).toBe("micWebm");
    expect(createRecordingTrackId("system", 0)).toBe("systemWebm");
    expect(recordingTrackToMediaTrack.mic).toBe("micWebm");
  });

  it("gives every additional screen, camera, mic, and system source its own track id", () => {
    expect(createRecordingTrackId("screen", 1)).toBe("screen-2");
    expect(createRecordingTrackId("screen", 2)).toBe("screen-3");
    expect(createRecordingTrackId("camera", 1)).toBe("camera-2");
    expect(createRecordingTrackId("mic", 1)).toBe("mic-2");
    expect(createRecordingTrackId("system", 1)).toBe("system-2");
  });

  it("derives a separate WAV output per recorded audio track", () => {
    expect(createWavTrackId("micWebm")).toBe("micWav");
    expect(createWavTrackId("systemWebm")).toBe("systemWav");
    expect(createWavTrackId("mic-2")).toBe("mic-2-wav");
    expect(createWavTrackId("system-3")).toBe("system-3-wav");
    expect(createWavTrackId("screen")).toBeNull();
    expect(createWavTrackId("camera-2")).toBeNull();
  });

  it("maps track ids back to their recording kind", () => {
    expect(getRecordingKindForTrackId("screen")).toBe("screen");
    expect(getRecordingKindForTrackId("screen-2")).toBe("screen");
    expect(getRecordingKindForTrackId("camera-2")).toBe("camera");
    expect(getRecordingKindForTrackId("micWebm")).toBe("mic");
    expect(getRecordingKindForTrackId("mic-2")).toBe("mic");
    expect(getRecordingKindForTrackId("systemWebm")).toBe("system");
    expect(getRecordingKindForTrackId("mic-2-wav")).toBe("mic");
    expect(getRecordingKindForTrackId("micWav")).toBe("mic");
    expect(getRecordingKindForTrackId("not-a-track")).toBeNull();
  });
});

describe("media track paths", () => {
  it("keeps the legacy file names untouched", () => {
    expect(getMediaTrackRelativePath("screen")).toBe("media/screen.webm");
    expect(getMediaTrackRelativePath("camera")).toBe("media/camera.webm");
    expect(getMediaTrackRelativePath("micWebm")).toBe("media/mic.webm");
    expect(getMediaTrackRelativePath("micWav")).toBe("media/mic.wav");
    expect(getMediaTrackRelativePath("systemWebm")).toBe("media/system.webm");
    expect(getMediaTrackRelativePath("systemWav")).toBe("media/system.wav");
  });

  it("stores additional sources in their own media files", () => {
    expect(getMediaTrackRelativePath("screen-2")).toBe("media/screen-2.webm");
    expect(getMediaTrackRelativePath("camera-3")).toBe("media/camera-3.webm");
    expect(getMediaTrackRelativePath("mic-2")).toBe("media/mic-2.webm");
    expect(getMediaTrackRelativePath("mic-2-wav")).toBe("media/mic-2.wav");
    expect(getMediaTrackRelativePath("system-2")).toBe("media/system-2.webm");
    expect(getMediaTrackRelativePath("system-2-wav")).toBe("media/system-2.wav");
  });
});

describe("parseMediaTrackKey", () => {
  it("accepts the legacy and the multi-source media track ids", () => {
    for (const key of [
      "screen",
      "camera",
      "micWebm",
      "micWav",
      "systemWebm",
      "systemWav",
      "screen-2",
      "camera-12",
      "mic-2",
      "system-2",
      "mic-2-wav",
      "system-12-wav"
    ]) {
      expect(parseMediaTrackKey(key)).toBe(key);
    }
  });

  it("rejects unknown, malformed, and escaping track ids", () => {
    for (const key of [
      "",
      "screen-1",
      "screen-0",
      "screen-100",
      "screen-2-wav",
      "camera-2-wav",
      "mic-2-wav-wav",
      "../media/screen.webm",
      "screen/../camera",
      "unknown"
    ]) {
      expect(parseMediaTrackKey(key)).toBeNull();
    }
  });
});
