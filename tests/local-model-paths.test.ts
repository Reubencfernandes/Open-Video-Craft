import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveLocalModelPaths } from "../src/shared/local-model-paths";

describe("local model paths", () => {
  it("places models and cache under writable userData", () => {
    const userData = path.join(path.sep, "Users", "owner", "Library", "Application Support", "Open Video Craft");
    const paths = resolveLocalModelPaths(userData);
    expect(paths.localModelPath).toBe(path.join(userData, "models"));
    expect(paths.cacheDir).toBe(path.join(userData, "model-cache"));
    expect(paths.localModelPath).not.toContain("app.asar");
    expect(paths.cacheDir).not.toContain("app.asar");
  });
});
