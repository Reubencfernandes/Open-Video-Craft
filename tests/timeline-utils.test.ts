import { describe, expect, it } from "vitest";
import {
  calculateTimelineDuration,
  findSplittableTimelineSegment,
  createTimelineClipStyle,
  getSnappedInsertStart,
  getContextMenuSplitSelectionIds,
  syncTimelineSegments,
  resolveAudioLane,
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
  const item: EditorMediaItem = { id: "video-a", name: "A", url: "a.mp4", kind: "video", origin: "imported", track: "imported", duration: 60 };

  it("snaps a newly inserted video clip to the end of the last clip", () => {
    const existing: TimelineSegment[] = [
      { id: "first", itemId: "video-a", track: "video", lane: 0, start: 0, end: 10, sourceStart: 0 }
    ];
    expect(getSnappedInsertStart(existing, "video", 5, 5, 20)).toBe(10);
  });

  it("renders a near-zero clip with a pixel-sized minimum width", () => {
    const style = createTimelineClipStyle(0, 0.01, 1_000);
    expect(style.width).toBe("0.001%");
    expect(style.minWidth).toBe("2px");
  });

  it("preserves deliberate short trims when media metadata resynchronizes", () => {
    const trimmed = trimTimelineSegment([videoSegments[0]], "first", "end", 0.5, new Map([[item.id, 60]]));
    expect(syncTimelineSegments(trimmed, [item], new Map([[item.id, 60]]), new Set())[0].end).toBe(0.5);
  });

  it("preserves source offsets and lengths while metadata is unknown", () => {
    const segment = { ...videoSegments[0], start: 50, end: 110, sourceStart: 30 };
    for (const durations of [new Map<string, number>(), new Map([[item.id, 0]])]) {
      expect(syncTimelineSegments([segment], [item], durations, new Set())[0]).toEqual(segment);
    }
  });

  it("only expands explicitly marked placeholders once metadata arrives", () => {
    const pending = syncTimelineSegments([], [{ ...item, duration: null }], new Map(), new Set([item.id]));
    expect(pending[0]).toMatchObject({ end: 1, pendingDuration: true });
    const resolved = syncTimelineSegments(pending, [item], new Map([[item.id, 60]]), new Set());
    expect(resolved[0]).toMatchObject({ end: 60, pendingDuration: false });
    const trimmed = trimTimelineSegment(pending, pending[0].id, "end", 0.5, new Map());
    expect(syncTimelineSegments(trimmed, [item], new Map([[item.id, 60]]), new Set())[0].end).toBe(0.5);
  });

  it("does not extend a start trim before the source begins", () => {
    const result = trimTimelineSegment([videoSegments[1]], "second", "start", 0, new Map([["video-b", 12]]));
    expect(result[0]).toMatchObject({ start: 3, sourceStart: 0, end: 10 });
  });

  it("assigns sparse audio lanes without allocating by the largest lane ID", () => {
    const segments = [0, 1_000_000_000].map((lane) => ({ ...videoSegments[0], id: `audio-${lane}`, track: "audio" as const, lane }));
    expect(resolveAudioLane(segments, "new", 0, 2, 0)).toBe(1);
    expect(resolveAudioLane(segments, "new", 0, 2, 3)).toBe(3);
  });

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

  it("trims a clip down to near zero duration", () => {
    const audio: TimelineSegment = {
      id: "music", itemId: "music", track: "audio", lane: 0, start: 0, end: 10, sourceStart: 0
    };
    const result = trimTimelineSegment([audio], "music", "end", 0.01, new Map([["music", 10]]));
    expect(result[0]?.end).toBeCloseTo(0.01, 2);
  });

  it("keeps a near-zero trim when media metadata resynchronizes", () => {
    const audio: TimelineSegment = {
      id: "music", itemId: "music", track: "audio", lane: 0, start: 0, end: 10, sourceStart: 0
    };
    const trimmed = trimTimelineSegment([audio], "music", "end", 0.01, new Map([["music", 10]]));
    const media: EditorMediaItem = { ...item, id: "music", kind: "audio", name: "Music" };
    const synced = syncTimelineSegments(trimmed, [media], new Map([["music", 10]]), new Set());
    expect(synced[0]?.end).toBeCloseTo(0.01, 2);
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

describe("splitting from the timeline context menu", () => {
  const segments: TimelineSegment[] = [
    { id: "video-1", itemId: "video-a", track: "video", lane: 0, start: 0, end: 10, sourceStart: 0 },
    { id: "audio-1", itemId: "audio-a", track: "audio", lane: 0, start: 0, end: 10, sourceStart: 0 },
    { id: "video-2", itemId: "video-b", track: "video", lane: 0, start: 20, end: 30, sourceStart: 0 },
    { id: "other", itemId: "video-c", track: "video", lane: 1, start: 0, end: 10, sourceStart: 0 }
  ];
  const menu = (segmentId: string | null, time: number) => ({ x: 0, y: 0, time, segmentId });

  it("cuts every selected clip, not only the one that was right-clicked", () => {
    const ids = getContextMenuSplitSelectionIds(segments, ["video-1", "audio-1", "video-2"], menu("video-1", 4));
    // video-2 does not span the cut time, so it is left out: it cannot be split there.
    expect(ids).toEqual(["video-1", "audio-1"]);
  });

  it("leaves the unselected clips alone, even when they sit under the cut", () => {
    const ids = getContextMenuSplitSelectionIds(segments, ["video-1", "audio-1"], menu("audio-1", 4));
    expect(ids).not.toContain("other");
  });

  it("falls back to the clicked clip when it is not part of the selection", () => {
    expect(getContextMenuSplitSelectionIds(segments, ["video-1", "audio-1"], menu("video-2", 25))).toBeNull();
  });

  it("falls back to the clicked clip when only one clip is selected", () => {
    expect(getContextMenuSplitSelectionIds(segments, ["video-1"], menu("video-1", 4))).toBeNull();
  });

  it("falls back when the menu was opened on empty space", () => {
    expect(getContextMenuSplitSelectionIds(segments, ["video-1", "audio-1"], menu(null, 4))).toBeNull();
  });
});
