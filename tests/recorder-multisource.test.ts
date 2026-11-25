import { describe, expect, it } from "vitest";
import {
  captureDisplayStreamsSequentially,
  createRecordingCaptures,
  reconcileCameraSelection,
  reconcileSourceSelection,
  toggleCameraSelection,
  toggleSourceSelection
} from "../src/renderer/recorder/recorder-utils";
import type { DeviceOption } from "../src/renderer/recorder/types";

function fakeTrack(kind: "video" | "audio", id: string): MediaStreamTrack {
  return { kind, id } as unknown as MediaStreamTrack;
}

function fakeStream(input: { audioTracks?: MediaStreamTrack[]; videoTracks?: MediaStreamTrack[] }) {
  return {
    getAudioTracks: () => input.audioTracks ?? [],
    getVideoTracks: () => input.videoTracks ?? []
  };
}

describe("createRecordingCaptures", () => {
  it("keeps the first screen and camera on the legacy track ids", () => {
    const captures = createRecordingCaptures({
      screens: [{ sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" }],
      cameras: [{ deviceId: "camera-1", label: "Face", mimeType: "video/webm" }],
      mic: { deviceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
      system: { mimeType: "audio/webm" }
    });

    expect(captures).toEqual([
      { trackId: "screen", kind: "screen", sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" },
      { trackId: "camera", kind: "camera", sourceId: "camera-1", label: "Face", mimeType: "video/webm" },
      { trackId: "micWebm", kind: "mic", sourceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
      { trackId: "systemWebm", kind: "system", sourceId: null, label: "System audio", mimeType: "audio/webm" }
    ]);
  });

  it("gives every additional screen and camera its own video track", () => {
    const captures = createRecordingCaptures({
      screens: [
        { sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" },
        { sourceId: "screen:1:0", label: "Display 2", mimeType: "video/webm" },
        { sourceId: "window:2:0", label: "Slides", mimeType: "video/webm" }
      ],
      cameras: [
        { deviceId: "camera-1", label: "Face", mimeType: "video/webm" },
        { deviceId: "camera-2", label: "Desk", mimeType: "video/webm" }
      ],
      mic: { deviceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
      system: { mimeType: "audio/webm" }
    });

    expect(captures.map((capture) => capture.trackId)).toEqual([
      "screen",
      "screen-2",
      "screen-3",
      "camera",
      "camera-2",
      "micWebm",
      "systemWebm"
    ]);
    expect(captures.map((capture) => capture.kind)).toEqual([
      "screen",
      "screen",
      "screen",
      "camera",
      "camera",
      "mic",
      "system"
    ]);
    expect(captures.map((capture) => capture.sourceId)).toEqual([
      "screen:0:0",
      "screen:1:0",
      "window:2:0",
      "camera-1",
      "camera-2",
      "mic-1",
      null
    ]);
  });

  it("keeps microphone and PC audio as distinct tracks", () => {
    const captures = createRecordingCaptures({
      screens: [{ sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" }],
      cameras: [],
      mic: { deviceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
      system: { mimeType: "audio/webm" }
    });

    const audio = captures.filter((capture) => capture.kind === "mic" || capture.kind === "system");
    expect(audio.map((capture) => capture.trackId)).toEqual(["micWebm", "systemWebm"]);
    expect(new Set(audio.map((capture) => capture.trackId)).size).toBe(2);
  });
});

describe("source selection", () => {
  const sources = [
    { id: "screen:0:0", name: "Display 1", kind: "screen" as const, displayId: "1", thumbnail: "", appIcon: null },
    { id: "screen:1:0", name: "Display 2", kind: "screen" as const, displayId: "2", thumbnail: "", appIcon: null },
    { id: "window:2:0", name: "Slides", kind: "window" as const, displayId: "", thumbnail: "", appIcon: null }
  ];

  it("adds and removes screens while keeping at least one selected", () => {
    expect(toggleSourceSelection([], "screen:0:0")).toEqual(["screen:0:0"]);
    expect(toggleSourceSelection(["screen:0:0"], "screen:1:0")).toEqual([
      "screen:0:0",
      "screen:1:0"
    ]);
    expect(toggleSourceSelection(["screen:0:0", "screen:1:0"], "screen:0:0")).toEqual([
      "screen:1:0"
    ]);
    expect(toggleSourceSelection(["screen:0:0"], "screen:0:0")).toEqual(["screen:0:0"]);
  });

  it("reconciles the selection with the available sources", () => {
    expect(reconcileSourceSelection(sources, [])).toEqual(["screen:0:0"]);
    expect(reconcileSourceSelection(sources, ["window:2:0"])).toEqual(["window:2:0"]);
    expect(reconcileSourceSelection(sources, ["gone:1", "screen:1:0"])).toEqual(["screen:1:0"]);
  });

  it("selects multiple cameras and drops devices that disappeared", () => {
    const cameras: DeviceOption[] = [
      { deviceId: "camera-1", label: "Face" },
      { deviceId: "camera-2", label: "Desk" }
    ];
    expect(toggleCameraSelection([], "camera-1")).toEqual(["camera-1"]);
    expect(toggleCameraSelection(["camera-1"], "camera-2")).toEqual(["camera-1", "camera-2"]);
    expect(toggleCameraSelection(["camera-1"], "camera-1")).toEqual([]);
    expect(reconcileCameraSelection(cameras, ["gone", "camera-2"])).toEqual(["camera-2"]);
    expect(reconcileCameraSelection(cameras, [])).toEqual([]);
  });
});

describe("captureDisplayStreamsSequentially", () => {
  it("captures every selected display one at a time and keeps system audio on its own track", async () => {
    const events: string[] = [];
    const videoTrack = fakeTrack("video", "video-1");

    const result = await captureDisplayStreamsSequentially({
      sourceIds: ["screen:0:0", "screen:1:0"],
      systemAudio: true,
      createOptions: (withSystemAudio) => ({ video: true, audio: withSystemAudio }),
      selectSource: async (sourceId) => {
        events.push(`select:${sourceId}`);
        return true;
      },
      releaseSource: async () => {
        events.push("release");
      },
      getDisplayMedia: async (options) => {
        events.push(`capture:${options.audio ? "with-audio" : "video-only"}`);
        return fakeStream({
          videoTracks: [videoTrack],
          audioTracks: options.audio ? [fakeTrack("audio", "system-audio")] : []
        });
      }
    });

    expect(events).toEqual([
      "select:screen:0:0",
      "capture:with-audio",
      "select:screen:1:0",
      "capture:video-only"
    ]);
    expect(result.screens.map((screen) => screen.sourceId)).toEqual([
      "screen:0:0",
      "screen:1:0"
    ]);
    expect(result.screens.every((screen) => screen.stream.getVideoTracks().length === 1)).toBe(true);
    expect(result.systemAudioTracks).toHaveLength(1);
  });

  it("retries the capture without system audio and releases the reservation", async () => {
    const events: string[] = [];
    let attempts = 0;

    const result = await captureDisplayStreamsSequentially({
      sourceIds: ["screen:0:0"],
      systemAudio: true,
      createOptions: (withSystemAudio) => ({ video: true, audio: withSystemAudio }),
      selectSource: async (sourceId) => {
        events.push(`select:${sourceId}`);
      },
      releaseSource: async () => {
        events.push("release");
      },
      getDisplayMedia: async (options) => {
        attempts += 1;
        events.push(`capture:${options.audio ? "with-audio" : "video-only"}`);
        if (options.audio) {
          throw new Error("system audio not supported");
        }
        return fakeStream({ videoTracks: [fakeTrack("video", "video-1")] });
      }
    });

    expect(attempts).toBe(2);
    expect(events).toEqual([
      "select:screen:0:0",
      "capture:with-audio",
      "release",
      "select:screen:0:0",
      "capture:video-only"
    ]);
    expect(result.systemAudioTracks).toEqual([]);
  });

  it("releases the reservation and stops capturing when a display cannot be captured", async () => {
    const events: string[] = [];

    await expect(captureDisplayStreamsSequentially({
      sourceIds: ["screen:0:0", "screen:1:0"],
      systemAudio: false,
      createOptions: () => ({ video: true, audio: false }),
      selectSource: async (sourceId) => {
        events.push(`select:${sourceId}`);
      },
      releaseSource: async () => {
        events.push("release");
      },
      getDisplayMedia: async () => {
        throw new Error("permission denied");
      }
    })).rejects.toThrow("permission denied");

    expect(events).toEqual(["select:screen:0:0", "release"]);
  });

  it("requires at least one selected screen or window", async () => {
    await expect(captureDisplayStreamsSequentially({
      sourceIds: [],
      systemAudio: false,
      createOptions: () => ({ video: true, audio: false }),
      selectSource: async () => undefined,
      releaseSource: async () => undefined,
      getDisplayMedia: async () => fakeStream({})
    })).rejects.toThrow(/at least one screen/);
  });
});
