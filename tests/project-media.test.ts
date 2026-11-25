import { describe, expect, it } from "vitest";

import { projectMediaTrackSpecs } from "../src/renderer/editor/media-utils";
import type { MediaTrackKey, ProjectRecordingTrack, ProjectTrack } from "../src/shared/types";

function track(bytesWritten: number): ProjectTrack {
  return { trackId: "screen", path: "media/track.webm", bytesWritten };
}

describe("project media tracks", () => {
  it("keeps the legacy single-source item ids and prefers the WAV audio", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-1",
      tracks: {
        screen: track(1200),
        camera: track(900),
        micWebm: track(300),
        micWav: track(120),
        systemWebm: track(400),
        systemWav: track(140)
      },
      mediaUrls: {
        screen: "ovc-media://screen",
        camera: "ovc-media://camera",
        micWebm: "ovc-media://mic-webm",
        micWav: "ovc-media://mic-wav",
        systemWebm: "ovc-media://system-webm",
        systemWav: "ovc-media://system-wav"
      }
    });

    expect(specs.map((spec) => spec.itemId)).toEqual([
      "project-1:screen",
      "project-1:camera",
      "project-1:audio",
      "project-1:system-audio"
    ]);
    expect(specs.map((spec) => spec.url)).toEqual([
      "ovc-media://screen",
      "ovc-media://camera",
      "ovc-media://mic-wav",
      "ovc-media://system-wav"
    ]);
    expect(specs.map((spec) => spec.track)).toEqual(["screen", "camera", "audio", "audio"]);
    expect(specs[2]?.usesWav).toBe(true);
  });

  it("keeps every extra source of a multi-source recording as its own item", () => {
    const recordingTracks: ProjectRecordingTrack[] = [
      { trackId: "screen", kind: "screen", sourceId: null, label: "Display 1" },
      { trackId: "screen-2", kind: "screen", sourceId: null, label: "Display 2" },
      { trackId: "camera", kind: "camera", sourceId: "cam-1", label: "Facecam" },
      { trackId: "camera-2", kind: "camera", sourceId: "cam-2", label: "OBS Virtual" },
      { trackId: "mic-2", kind: "mic", sourceId: "mic-2", label: "Shure MV7" }
    ];
    const mediaUrls: Partial<Record<MediaTrackKey, string>> = {
      screen: "ovc-media://screen",
      "screen-2": "ovc-media://screen-2",
      camera: "ovc-media://camera",
      "camera-2": "ovc-media://camera-2",
      "mic-2": "ovc-media://mic-2-webm",
      "mic-2-wav": "ovc-media://mic-2-wav"
    };

    const specs = projectMediaTrackSpecs({
      id: "project-2",
      tracks: {},
      recordingTracks,
      mediaUrls
    });

    expect(specs.map((spec) => spec.itemId)).toEqual([
      "project-2:screen",
      "project-2:screen-2",
      "project-2:camera",
      "project-2:camera-2",
      "project-2:audio-2"
    ]);
    expect(specs.map((spec) => spec.name)).toEqual([
      "screen.webm",
      "screen-2.webm",
      "camera.webm",
      "camera-2.webm",
      "mic-2.wav"
    ]);
    expect(specs.filter((spec) => spec.kind === "video")).toHaveLength(4);
  });

  it("still exposes audio that only has a WAV output", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-3",
      tracks: { screen: track(1000), micWav: track(80) },
      mediaUrls: { screen: "ovc-media://screen", micWav: "ovc-media://mic-wav" }
    });

    expect(specs.map((spec) => spec.itemId)).toEqual(["project-3:screen", "project-3:audio"]);
    expect(specs[1]?.url).toBe("ovc-media://mic-wav");
  });

  it("skips a recorded source whose media is not written yet", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-4",
      tracks: {},
      recordingTracks: [
        { trackId: "screen", kind: "screen", sourceId: null, label: "Display 1" },
        { trackId: "camera", kind: "camera", sourceId: "cam", label: "Camera" }
      ],
      mediaUrls: { screen: "ovc-media://screen" }
    });

    expect(specs.map((spec) => spec.itemId)).toEqual(["project-4:screen"]);
  });

  it("ignores legacy tracks that never received bytes", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-5",
      tracks: { screen: track(10), camera: track(0) },
      mediaUrls: { screen: "ovc-media://screen", camera: "ovc-media://camera" }
    });

    expect(specs.map((spec) => spec.itemId)).toEqual(["project-5:screen"]);
  });
});
