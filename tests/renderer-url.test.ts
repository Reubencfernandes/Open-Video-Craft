import { describe, expect, it } from "vitest";
import { resolveRendererBaseUrl } from "../src/main/renderer-url";

const fileUrl = "file:///app/dist-renderer/index.html";

describe("resolveRendererBaseUrl", () => {
  it("uses the dev server URL when the app is not packaged", () => {
    expect(
      resolveRendererBaseUrl({ isPackaged: false, devServerUrl: "http://127.0.0.1:5173", fileUrl })
    ).toBe("http://127.0.0.1:5173");
  });

  it("ignores the dev server URL when the app is packaged", () => {
    expect(
      resolveRendererBaseUrl({ isPackaged: true, devServerUrl: "https://evil.example", fileUrl })
    ).toBe(fileUrl);
  });

  it("falls back to the bundled file when no dev server is configured", () => {
    expect(resolveRendererBaseUrl({ isPackaged: false, devServerUrl: undefined, fileUrl })).toBe(fileUrl);
    expect(resolveRendererBaseUrl({ isPackaged: false, devServerUrl: "", fileUrl })).toBe(fileUrl);
  });
});
