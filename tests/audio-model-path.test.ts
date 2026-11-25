import { describe, expect, it } from "vitest";
import { resolveArnndnModelPath } from "../src/main/audio-model-path";

describe("resolveArnndnModelPath", () => {
  it("uses packaged resources when a resources path is provided", () => {
    expect(resolveArnndnModelPath("/Apps/Open Video Craft.app/Contents/Resources", "/src/main"))
      .toBe("/Apps/Open Video Craft.app/Contents/Resources/models/lq.rnnn");
  });

  it("uses the repository resource during development", () => {
    expect(resolveArnndnModelPath(undefined, "/repo/dist-electron/main"))
      .toBe("/repo/resources/models/lq.rnnn");
  });
});
