import { describe, expect, it } from "vitest";

import {
  emptyScreenCrop,
  hasScreenCrop,
  normalizeScreenCrop,
  screenCropFilter,
  screenCropTransform
} from "../src/shared/editor-domain/screen-crop";

describe("screen crop geometry", () => {
  it("treats an absent or empty crop as no crop", () => {
    expect(hasScreenCrop(undefined)).toBe(false);
    expect(hasScreenCrop(emptyScreenCrop)).toBe(false);
    expect(screenCropTransform(emptyScreenCrop)).toBeNull();
    expect(screenCropFilter(emptyScreenCrop)).toBeNull();
  });

  it("fills the frame with the kept region when the menu bar is cropped away", () => {
    const transform = screenCropTransform({ top: 10, right: 0, bottom: 0, left: 0 });

    expect(transform?.transformOrigin).toBe("0 0");
    expect(transform?.transform).toBe("translate(0.000%, -11.111%) scale(1.0000, 1.1111)");
  });

  it("keeps the horizontal offset so a left crop is centered", () => {
    const transform = screenCropTransform({ top: 0, right: 0, bottom: 0, left: 5 });

    expect(transform?.transform).toBe("translate(-5.263%, 0.000%) scale(1.0526, 1.0000)");
  });

  it("produces the matching ffmpeg crop for the recorded file", () => {
    expect(screenCropFilter({ top: 10, right: 5, bottom: 0, left: 5 })).toBe(
      "crop=iw*9000/10000:ih*9000/10000:iw*500/10000:ih*1000/10000"
    );
  });

  it("refuses a crop that would remove the whole picture", () => {
    expect(normalizeScreenCrop({ top: 70, right: 0, bottom: 30, left: 0 })).toEqual(emptyScreenCrop);
    expect(hasScreenCrop({ top: 95, right: 0, bottom: 0, left: 0 })).toBe(false);
  });

  it("rejects an out-of-range crop instead of clamping it into a different picture", () => {
    expect(normalizeScreenCrop({ top: -10, right: 0, bottom: 0, left: 0 })).toEqual(emptyScreenCrop);
    expect(normalizeScreenCrop({ top: 75, right: 0, bottom: 0, left: 0 })).toEqual(emptyScreenCrop);
  });
});
