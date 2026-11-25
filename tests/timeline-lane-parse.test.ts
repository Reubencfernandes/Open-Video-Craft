import { describe, expect, it } from "vitest";

import { parseTimelineLaneId } from "../src/renderer/editor/useTimelineDragInteractions";

describe("timeline lane ids", () => {
  it("accepts every video channel row", () => {
    expect(parseTimelineLaneId("video")).toBe("video");
    expect(parseTimelineLaneId("video:1")).toBe("video:1");
    expect(parseTimelineLaneId("video:2")).toBe("video:2");
  });

  it("keeps accepting audio channels and effect rows", () => {
    expect(parseTimelineLaneId("audio:0")).toBe("audio:0");
    expect(parseTimelineLaneId("zoom")).toBe("zoom");
    expect(parseTimelineLaneId("subtitles")).toBe("subtitles");
  });

  it("rejects anything that is not a lane", () => {
    expect(parseTimelineLaneId(undefined)).toBeNull();
    expect(parseTimelineLaneId("video:x")).toBeNull();
    expect(parseTimelineLaneId("nonsense")).toBeNull();
  });
});
