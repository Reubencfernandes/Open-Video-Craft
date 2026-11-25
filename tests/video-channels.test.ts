import { describe, expect, it } from "vitest";

import { projectMediaTrackSpecs } from "../src/renderer/editor/media-utils";
import { syncTimelineSegments } from "../src/renderer/editor/timeline-utils";
import { resolveCompositionLayers } from "../src/shared/editor-domain/timeline-visibility";
import type { EditorMediaItem } from "../src/renderer/editor/types";

function videoItem(id: string, channel?: number): EditorMediaItem {
  return {
    id,
    name: `${id}.webm`,
    url: `ovc-media://${id}`,
    kind: "video",
    origin: "project",
    track: id.includes("camera") ? "camera" : "screen",
    duration: 10,
    ...(channel === undefined ? {} : { channel })
  };
}

const durations = new Map([
  ["project:screen", 10],
  ["project:screen-2", 10],
  ["project:camera-2", 10],
  ["imported-clip", 4]
]);

describe("video channels of a multi-source recording", () => {
  it("places every channel at time 0 instead of appending one after another", () => {
    const items = [
      videoItem("project:screen", 0),
      videoItem("project:screen-2", 1),
      videoItem("project:camera-2", 2)
    ];
    const segments = syncTimelineSegments([], items, durations, new Set(items.map((item) => item.id)));

    expect(segments.map((segment) => [segment.itemId, segment.start, segment.lane])).toEqual([
      ["project:screen", 0, 0],
      ["project:screen-2", 0, 1],
      ["project:camera-2", 0, 2]
    ]);
  });

  it("keeps an imported clip sequenced after the existing video", () => {
    const first = videoItem("project:screen", 0);
    const imported: EditorMediaItem = {
      id: "imported-clip",
      name: "b-roll.mp4",
      url: "ovc-import://b-roll",
      kind: "video",
      origin: "imported",
      track: "imported",
      duration: 4
    };

    const withFirst = syncTimelineSegments([], [first], durations, new Set([first.id]));
    const both = syncTimelineSegments(withFirst, [first, imported], durations, new Set([imported.id]));

    const importedSegment = both.find((segment) => segment.itemId === "imported-clip");
    expect(importedSegment?.start).toBe(10);
    expect(importedSegment?.lane).toBe(0);
  });

  it("preserves a saved channel when the timeline is rebuilt", () => {
    const items = [videoItem("project:screen", 0), videoItem("project:screen-2", 1)];
    const created = syncTimelineSegments([], items, durations, new Set(items.map((item) => item.id)));
    const rebuilt = syncTimelineSegments(created, items, durations, new Set());

    expect(rebuilt.map((segment) => segment.lane)).toEqual([0, 1]);
    expect(rebuilt.map((segment) => segment.start)).toEqual([0, 0]);
  });
});

describe("project media channels", () => {
  it("puts cameras in the upper channel while preserving screen-first media ids", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-9",
      tracks: {},
      recordingTracks: [
        { trackId: "camera", kind: "camera", sourceId: "cam", label: "Camera" },
        { trackId: "screen", kind: "screen", sourceId: null, label: "Display 1" },
        { trackId: "screen-2", kind: "screen", sourceId: null, label: "Display 2" }
      ],
      mediaUrls: {
        camera: "ovc-media://camera",
        screen: "ovc-media://screen",
        "screen-2": "ovc-media://screen-2"
      }
    });

    // Two screens and one camera: the single camera keeps the floating overlay.
    expect(specs.map((spec) => [spec.itemId, spec.channel])).toEqual([
      ["project-9:screen", 1],
      ["project-9:screen-2", 2],
      ["project-9:camera", 0]
    ]);
  });

  it("leaves a single-source recording on the classic single video lane", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-10",
      tracks: {},
      recordingTracks: [
        { trackId: "screen", kind: "screen", sourceId: null, label: "Display 1" },
        { trackId: "camera", kind: "camera", sourceId: "cam", label: "Camera" }
      ],
      mediaUrls: { screen: "ovc-media://screen", camera: "ovc-media://camera" }
    });

    expect(specs.every((spec) => spec.channel === undefined)).toBe(true);
  });
});

describe("active video clip on the canvas", () => {
  const clip = (id: string, lane: number) => ({
    id,
    role: "base" as const,
    lane,
    start: 0,
    end: 10
  });

  it("shows the lowest channel while several channels cover the same moment", () => {
    const active = resolveCompositionLayers(
      [clip("channel-2", 2), clip("channel-0", 0), clip("channel-1", 1)],
      3
    );
    expect(active.primary?.id).toBe("channel-0");
  });

  it("falls through to the next channel once the main channel is cut away", () => {
    const main = { ...clip("channel-0", 0), end: 2 };
    const active = resolveCompositionLayers([main, clip("channel-1", 1)], 3);
    expect(active.primary?.id).toBe("channel-1");
  });

  it("returns no clip when nothing covers the moment", () => {
    expect(resolveCompositionLayers([clip("channel-0", 0)], 12).primary).toBeNull();
  });
});

describe("two webcams", () => {
  it("gives each webcam its own channel so both appear as tracks", () => {
    const specs = projectMediaTrackSpecs({
      id: "project-11",
      tracks: {},
      recordingTracks: [
        { trackId: "screen", kind: "screen", sourceId: "screen:1:0", label: "Schermo 1" },
        { trackId: "camera", kind: "camera", sourceId: "cam-a", label: "Elgato" },
        { trackId: "camera-2", kind: "camera", sourceId: "cam-b", label: "Angetube" }
      ],
      mediaUrls: {
        screen: "ovc-media://screen",
        camera: "ovc-media://camera",
        "camera-2": "ovc-media://camera-2"
      }
    });

    expect(specs.map((spec) => [spec.itemId, spec.channel])).toEqual([
      ["project-11:screen", 2],
      ["project-11:camera", 0],
      ["project-11:camera-2", 1]
    ]);
  });
});
