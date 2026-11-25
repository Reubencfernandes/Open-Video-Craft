import { describe, expect, it } from "vitest";

import { resolveClipLayout } from "../src/renderer/editor/timeline-utils";

describe("layout per clip", () => {
  it("uses the clip layout while that clip is on screen", () => {
    expect(resolveClipLayout("side-by-side", "bubble")).toBe("side-by-side");
  });

  it("falls back to the project layout when the clip has none", () => {
    expect(resolveClipLayout(undefined, "presenter")).toBe("presenter");
  });
});
