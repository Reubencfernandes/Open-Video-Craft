import { describe, expect, it } from "vitest";
import {
  calculateTimelineDuration,
  findSplittableTimelineSegment,
  syncTimelineSegments,
  trimTimelineSegment
} from "../src/renderer/editor/timeline-utils";
import { splitTimelineSegments } from "../src/renderer/editor/timeline-split";
import { getMediaTimeForTimelineTime } from "../src/renderer/editor/playback-sync";
import type { EditorMediaItem, TimelineSegment } from "../src/renderer/editor/types";

const videoSegments: TimelineSegment[] = [
  { id: "first", itemId: "video-a", track: "video", lane: 0, start: 0, end: 5, sourceStart: 0 },
  { id: "second", itemId: "video-b", track: "video", lane: 0, start: 5, end: 10, sourceStart: 2 }
];

describe("timeline trim and split geometry", () => {
  it("trims a clip start and advances its source offset by the same amount", () => {
    const result = trimTimelineSegment(
      videoSegments,
      "second",
      "start",
      7,
      new Map([["video-b", 12]])
    );
    expect(result.find((segment) => segment.id === "second")).toMatchObject({
      start: 7,
      end: 10,
      sourceStart: 4
    });
  });

  it("clamps an end trim to the remaining source media", () => {
    const result = trimTimelineSegment(
      videoSegments,
      "second",
      "end",
      30,
      new Map([["video-b", 12]])
    );
    expect(result.find((segment) => segment.id === "second")?.end).toBe(15);
  });

  it("splits the clip under the playhead instead of a stale selected clip", () => {
    const target = findSplittableTimelineSegment(videoSegments, "first", 7.5);
    expect(target?.id).toBe("second");
  });

  it("prefers the video clip over overlapping audio at the playhead", () => {
    const audio: TimelineSegment = {
      id: "music",
      itemId: "audio-a",
      track: "audio",
      lane: 0,
      start: 0,
      end: 10,
      sourceStart: 0
    };
    const target = findSplittableTimelineSegment([audio, ...videoSegments], null, 2.5);
    expect(target?.id).toBe("first");
  });

  it("does not split at a clip boundary", () => {
    expect(findSplittableTimelineSegment(videoSegments, "first", 5)).toBeNull();
  });

  it("keeps source time continuous across both sides of a split", () => {
    const result = splitTimelineSegments(videoSegments, "second", 7, () => "right-half");

    expect(result?.left).toMatchObject({ start: 5, end: 7, sourceStart: 2 });
    expect(result?.right).toMatchObject({
      id: "right-half",
      start: 7,
      end: 10,
      sourceStart: 4
    });
    expect(getMediaTimeForTimelineTime(result!.left, 7)).toBe(4);
    expect(getMediaTimeForTimelineTime(result!.right, 7)).toBe(4);
  });

  it("does not expand a short left split as an unresolved duration placeholder", () => {
    const item: EditorMediaItem = {
      id: "video-a",
      name: "A",
      url: "ovc-media://a",
      kind: "video",
      origin: "project",
      track: "screen",
      duration: 5
    };
    const split = splitTimelineSegments([videoSegments[0]], "first", 0.5, () => "right-half");
    const synced = syncTimelineSegments(
      split!.segments,
      [item],
      new Map([[item.id, 5]]),
      new Set()
    );

    expect(synced.find((segment) => segment.id === "first")?.end).toBe(0.5);
    expect(synced.find((segment) => segment.id === "right-half")?.sourceStart).toBe(0.5);
  });
});

describe("timeline composition duration", () => {
  const videoItem: EditorMediaItem = {
    id: "video",
    name: "Video",
    url: "video.webm",
    kind: "video",
    origin: "imported",
    track: "imported",
    duration: 55
  };
  const audioItem: EditorMediaItem = {
    id: "music",
    name: "Music",
    url: "music.mp3",
    kind: "audio",
    origin: "imported",
    track: "imported",
    duration: 68
  };

  it("does not leave an empty video tail for audio extending past the last frame", () => {
    expect(calculateTimelineDuration(
      [{ id: "video-clip", item: videoItem, track: "video", lane: 0, start: 0, duration: 55, sourceStart: 0 }],
      [{ id: "music-clip", item: audioItem, track: "audio", lane: 1, start: 0, duration: 68, sourceStart: 0 }],
      [],
      [],
      [],
      68
    )).toBe(55);
  });

  it("uses the audio end when the project has no video clips", () => {
    expect(calculateTimelineDuration(
      [],
      [{ id: "music-clip", item: audioItem, track: "audio", lane: 1, start: 0, duration: 68, sourceStart: 0 }],
      [],
      [],
      [],
      68
    )).toBe(68);
  });
});
