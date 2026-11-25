import { describe, expect, it } from "vitest";

import {
  calloutTitle,
  defaultCalloutBox,
  generateTranscriptCallouts,
  isInformativeCue
} from "../src/shared/editor-domain/transcript-callouts";

const cue = (start: number, end: number, text: string) => ({ start, end, text });

describe("transcript callouts", () => {
  it("turns a spoken sentence into a titled, boxed, animated overlay", () => {
    const overlays = generateTranscriptCallouts([
      cue(10, 13, "Here is how you configure the export settings for YouTube")
    ]);

    expect(overlays).toHaveLength(1);
    const overlay = overlays[0];
    expect(overlay.id).toBe("callout-1");
    expect(overlay.title).toBe("Here is how you configure the export");
    expect(overlay.box).toEqual(defaultCalloutBox);
    expect(overlay.animation).toBe("pop");
    expect(overlay.start).toBe(10);
    expect(overlay.end).toBeGreaterThan(overlay.start);
  });

  it("drops filler, fragments and single words", () => {
    expect(isInformativeCue(cue(0, 1, "um"))).toBe(false);
    expect(isInformativeCue(cue(0, 1, "so and then"))).toBe(false);
    expect(isInformativeCue(cue(0, 3, "This is the real explanation"))).toBe(true);

    const overlays = generateTranscriptCallouts([
      cue(0, 1, "uh"),
      cue(2, 3, "yeah"),
      cue(4, 7, "This is the real explanation of the feature")
    ]);
    expect(overlays).toHaveLength(1);
  });

  it("never places two boxes too close together and keeps them ordered", () => {
    const overlays = generateTranscriptCallouts(
      [
        cue(1, 4, "First useful explanation about the timeline lanes"),
        cue(3, 6, "Second explanation very close to the first one"),
        cue(30, 33, "Third explanation far away on the timeline")
      ],
      { minGapSeconds: 8 }
    );

    expect(overlays).toHaveLength(2);
    expect(overlays[0].start).toBeLessThan(overlays[1].start);
    expect(Math.abs(overlays[0].start - overlays[1].start)).toBeGreaterThanOrEqual(8);
  });

  it("respects the maximum number of boxes", () => {
    const cues = Array.from({ length: 20 }, (_, index) =>
      cue(index * 20, index * 20 + 4, `Explanation number ${index} about the recording workflow`)
    );
    expect(generateTranscriptCallouts(cues, { maxCallouts: 3 })).toHaveLength(3);
  });

  it("never ends a box after the end of the timeline", () => {
    const overlays = generateTranscriptCallouts([cue(9, 12, "The last sentence says something useful")], {
      durationSeconds: 10,
      displaySeconds: 4
    });
    expect(overlays[0].end).toBeLessThanOrEqual(10);
  });

  it("strips a trailing period from the heading", () => {
    expect(calloutTitle("Export the final video.")).toBe("Export the final video");
  });
});
