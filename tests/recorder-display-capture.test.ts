import { describe, expect, it, vi } from "vitest";

const getSources = vi.fn();

vi.mock("electron", () => ({
  app: { getName: () => "Open Video Craft" },
  desktopCapturer: {
    getSources: (...args: unknown[]) => getSources(...args)
  }
}));

import {
  captureSourceThumbnails,
  releaseDisplayCaptureSource,
  reserveDisplayCaptureSource,
  takeReservedDisplayCaptureSource
} from "../src/main/desktop-sources";

describe("display capture source reservation", () => {
  it("hands the reserved source to exactly one capture", () => {
    reserveDisplayCaptureSource({ id: "screen:0:0", name: "Display 1" });

    expect(takeReservedDisplayCaptureSource()).toEqual({
      id: "screen:0:0",
      name: "Display 1"
    });
    expect(takeReservedDisplayCaptureSource()).toBeNull();
  });

  it("refuses to replace a source that is still waiting for its capture", () => {
    reserveDisplayCaptureSource({ id: "screen:0:0", name: "Display 1" });

    expect(() =>
      reserveDisplayCaptureSource({ id: "screen:1:0", name: "Display 2" })
    ).toThrow(/already being prepared/);
    expect(takeReservedDisplayCaptureSource()?.id).toBe("screen:0:0");
  });

  it("allows the same source to be reserved again and releases it on demand", () => {
    reserveDisplayCaptureSource({ id: "screen:0:0", name: "Display 1" });
    expect(() =>
      reserveDisplayCaptureSource({ id: "screen:0:0", name: "Display 1" })
    ).not.toThrow();

    releaseDisplayCaptureSource();
    expect(takeReservedDisplayCaptureSource()).toBeNull();
    expect(() =>
      reserveDisplayCaptureSource({ id: "screen:1:0", name: "Display 2" })
    ).not.toThrow();
    releaseDisplayCaptureSource();
  });
});

describe("captureSourceThumbnails", () => {
  it("returns a real still preview per available source", async () => {
    getSources.mockResolvedValueOnce([
      {
        id: "screen:0:0",
        name: "Display 1",
        thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from("one") }
      },
      {
        id: "screen:1:0",
        name: "Display 2",
        thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from("two") }
      },
      {
        id: "screen:2:0",
        name: "Display 3",
        thumbnail: { isEmpty: () => true, toPNG: () => Buffer.alloc(0) }
      }
    ]);

    const thumbnails = await captureSourceThumbnails(["screen:0:0", "screen:2:0"]);

    expect(thumbnails).toEqual({
      "screen:0:0": `data:image/png;base64,${Buffer.from("one").toString("base64")}`
    });
    expect(getSources).toHaveBeenCalledWith({
      types: ["screen", "window"],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: false
    });
  });

  it("does not ask for thumbnails when no source is requested", async () => {
    getSources.mockClear();

    await expect(captureSourceThumbnails([])).resolves.toEqual({});
    expect(getSources).not.toHaveBeenCalled();
  });
});
