import { describe, expect, it } from "vitest";
import {
  getLinkedRecordingAudioIds,
  getLinkedRecordingAudioIdsForSelection,
  getRecordingGroupId,
  isolateLinkedRecordingAudio,
  isRecordingAudioLinked,
  removeTimelineSegmentsWithLinkedAudio,
  trimTimelineSegmentWithLinkedAudio
} from "../src/renderer/editor/timeline-links";
import { splitTimelineSegments } from "../src/renderer/editor/timeline-split";
import { moveTimelineSegmentGroup, trimTimelineSegment } from "../src/renderer/editor/timeline-utils";
import type { TimelineSegment } from "../src/renderer/editor/types";

let nextId = 0;
const createId = (sourceId: string) => `${sourceId}-piece-${++nextId}`;

function recording(): TimelineSegment[] {
  return [
    { id: "screen", itemId: "p1:screen", track: "video", lane: 0, start: 0, end: 20, sourceStart: 0 },
    { id: "mic", itemId: "p1:audio", track: "audio", lane: 0, start: 0, end: 20, sourceStart: 0 },
    { id: "system", itemId: "p1:system-audio", track: "audio", lane: 1, start: 0, end: 20, sourceStart: 0 }
  ];
}

function byId(segments: TimelineSegment[], id: string): TimelineSegment {
  const segment = segments.find((item) => item.id === id);
  if (!segment) throw new Error(`missing ${id}`);
  return segment;
}

function offset(segment: TimelineSegment): number {
  return segment.start - segment.sourceStart;
}

describe("recording audio links", () => {
  it("groups only a recording's own screen, mic, and system tracks", () => {
    expect(getRecordingGroupId("p1:screen")).toBe("p1");
    expect(getRecordingGroupId("p1:system-audio")).toBe("p1");
    expect(getRecordingGroupId("import-abc")).toBeNull();

    const segments: TimelineSegment[] = [
      ...recording(),
      { id: "music", itemId: "import-music", track: "audio", lane: 2, start: 0, end: 20, sourceStart: 0 },
      { id: "other", itemId: "p2:audio", track: "audio", lane: 3, start: 0, end: 20, sourceStart: 0 }
    ];
    expect(getLinkedRecordingAudioIds(segments, "screen")).toEqual(["mic", "system"]);
    expect(getLinkedRecordingAudioIds(segments, "mic")).toEqual([]);
  });

  it("unlinks audio that was moved out of sync on its own", () => {
    const segments = recording().map((segment) =>
      segment.id === "mic" ? { ...segment, start: 0.4, end: 20.4 } : segment
    );
    expect(getLinkedRecordingAudioIds(segments, "screen")).toEqual(["system"]);
    expect(isRecordingAudioLinked(segments, byId(segments, "mic"))).toBe(false);
  });

  it("splits the voice together with the picture", () => {
    const result = splitTimelineSegments(recording(), "screen", 5, createId);
    expect(result).not.toBeNull();
    const segments = result!.segments;
    expect(segments.filter((segment) => segment.track === "audio")).toHaveLength(4);

    // Each half of the picture keeps exactly its own slice of both audio files.
    expect(getLinkedRecordingAudioIds(segments, result!.left.id).map((id) => byId(segments, id)))
      .toEqual([
        expect.objectContaining({ start: 0, end: 5, sourceStart: 0 }),
        expect.objectContaining({ start: 0, end: 5, sourceStart: 0 })
      ]);
    expect(getLinkedRecordingAudioIds(segments, result!.right.id).map((id) => byId(segments, id)))
      .toEqual([
        expect.objectContaining({ start: 5, end: 20, sourceStart: 5 }),
        expect.objectContaining({ start: 5, end: 20, sourceStart: 5 })
      ]);
  });

  it("does not split imported music when blading the picture", () => {
    const segments: TimelineSegment[] = [
      ...recording(),
      { id: "music", itemId: "import-music", track: "audio", lane: 2, start: 0, end: 20, sourceStart: 0 }
    ];
    const result = splitTimelineSegments(segments, "screen", 5, createId);
    expect(result!.segments.filter((segment) => segment.itemId === "import-music")).toHaveLength(1);
  });

  it("splitting a selected audio clip leaves the picture whole", () => {
    const result = splitTimelineSegments(recording(), "mic", 5, createId);
    expect(result!.segments.filter((segment) => segment.track === "video")).toHaveLength(1);
    expect(result!.segments.filter((segment) => segment.itemId === "p1:audio")).toHaveLength(2);
  });

  it("deletes the audio under a deleted clip, even when the audio was never split", () => {
    // A project edited before links existed: only the picture was cut.
    const segments: TimelineSegment[] = [
      { id: "a", itemId: "p1:screen", track: "video", lane: 0, start: 0, end: 5, sourceStart: 0 },
      { id: "b", itemId: "p1:screen", track: "video", lane: 0, start: 5, end: 10, sourceStart: 5 },
      { id: "c", itemId: "p1:screen", track: "video", lane: 0, start: 10, end: 20, sourceStart: 10 },
      { id: "mic", itemId: "p1:audio", track: "audio", lane: 0, start: 0, end: 20, sourceStart: 0 }
    ];
    const result = removeTimelineSegmentsWithLinkedAudio(segments, ["b"], createId);
    const audio = result.segments.filter((segment) => segment.track === "audio");

    expect(audio.map(({ start, end, sourceStart }) => ({ start, end, sourceStart }))).toEqual([
      { start: 0, end: 5, sourceStart: 0 },
      { start: 10, end: 20, sourceStart: 10 }
    ]);
    expect(result.removedIds).toContain("b");
    expect(result.removedIds).toHaveLength(2);
  });

  it("keeps the audio when asked to delete only the picture", () => {
    const result = removeTimelineSegmentsWithLinkedAudio(recording(), ["screen"], createId, {
      linked: false
    });
    expect(result.segments.map((segment) => segment.id)).toEqual(["mic", "system"]);
  });

  it("removes an explicitly selected audio clip whole instead of slicing it", () => {
    const segments: TimelineSegment[] = [
      { id: "b", itemId: "p1:screen", track: "video", lane: 0, start: 5, end: 10, sourceStart: 5 },
      { id: "mic", itemId: "p1:audio", track: "audio", lane: 0, start: 0, end: 20, sourceStart: 0 }
    ];
    const result = removeTimelineSegmentsWithLinkedAudio(segments, ["b", "mic"], createId);
    expect(result.segments).toEqual([]);
  });

  it("isolates linked audio so a moved clip keeps its voice in sync", () => {
    const split = splitTimelineSegments(recording(), "screen", 5, createId)!;
    const withoutLead = removeTimelineSegmentsWithLinkedAudio(split.segments, [split.left.id], createId);
    const isolated = isolateLinkedRecordingAudio(withoutLead.segments, [split.right.id], createId);
    const moved = moveTimelineSegmentGroup(
      isolated.segments,
      [split.right.id, ...isolated.linkedIds],
      -5,
      20
    );

    const picture = byId(moved, split.right.id);
    expect(picture.start).toBe(0);
    for (const id of isolated.linkedIds) {
      expect(offset(byId(moved, id))).toBeCloseTo(offset(picture), 6);
      expect(byId(moved, id).start).toBe(0);
    }
  });

  it("trims linked audio to the clip's new edges", () => {
    const segments = recording();
    const durations = new Map([["p1:screen", 20], ["p1:audio", 20], ["p1:system-audio", 20]]);
    const trimmedEnd = trimTimelineSegmentWithLinkedAudio(segments, "screen", "end", 12, durations, [
      "mic",
      "system"
    ]);
    expect(trimmedEnd.map((segment) => segment.end)).toEqual([12, 12, 12]);

    const trimmedStart = trimTimelineSegmentWithLinkedAudio(trimmedEnd, "screen", "start", 3, durations, [
      "mic",
      "system"
    ]);
    for (const segment of trimmedStart) {
      expect(segment).toMatchObject({ start: 3, sourceStart: 3, end: 12 });
    }
  });

  it("reports linked audio for a selection without repeating selected clips", () => {
    expect(getLinkedRecordingAudioIdsForSelection(recording(), ["screen", "mic"])).toEqual(["system"]);
  });
});

describe("video trim bounds", () => {
  const durations = new Map([["v", 30]]);
  const pair: TimelineSegment[] = [
    { id: "left", itemId: "v", track: "video", lane: 0, start: 0, end: 5, sourceStart: 0 },
    { id: "right", itemId: "v", track: "video", lane: 0, start: 8, end: 12, sourceStart: 12 }
  ];

  it("stops an end trim at the next clip instead of overlapping it", () => {
    const trimmed = trimTimelineSegment(pair, "left", "end", 10, durations);
    expect(byId(trimmed, "left").end).toBe(8);
  });

  it("stops a start trim at the previous clip instead of overlapping it", () => {
    const trimmed = trimTimelineSegment(pair, "right", "start", 2, durations);
    expect(byId(trimmed, "right").start).toBe(5);
    expect(byId(trimmed, "right").sourceStart).toBe(9);
  });

  it("never shrinks a clip that is already shorter than the minimum", () => {
    const tiny: TimelineSegment[] = [
      { id: "tiny", itemId: "v", track: "video", lane: 0, start: 4, end: 4.005, sourceStart: 4 }
    ];
    expect(byId(trimTimelineSegment(tiny, "tiny", "start", 4.009, durations), "tiny").start).toBe(4);
    expect(byId(trimTimelineSegment(tiny, "tiny", "end", 4.001, durations), "tiny").end).toBeCloseTo(4.005, 3);
  });
});
