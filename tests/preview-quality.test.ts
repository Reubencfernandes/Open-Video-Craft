import { describe, expect, it, vi } from "vitest";
import {
  previewQualityStorageKey,
  readPreviewQuality,
  writePreviewQuality
} from "../src/renderer/editor/preview-quality";

describe("preview quality preference", () => {
  it("defaults unknown values to high quality", () => {
    expect(readPreviewQuality({ getItem: () => null })).toBe("high");
    expect(readPreviewQuality({ getItem: () => "unexpected" })).toBe("high");
  });

  it("reads and writes the low quality preference", () => {
    expect(readPreviewQuality({ getItem: () => "low" })).toBe("low");
    const setItem = vi.fn();
    writePreviewQuality({ setItem }, "low");
    expect(setItem).toHaveBeenCalledWith(previewQualityStorageKey, "low");
  });
});
