import { describe, expect, it } from "vitest";

import {
  compositionRoleForItem,
  noCameraRecordingMessage,
  resolvePreviewComposition,
  shouldShowNoCameraRecording
} from "../src/renderer/editor/composition-layers";
import {
  getCompositionLayout,
  resolveCameraBorder
} from "../src/shared/editor-domain/timeline-visibility";
import type { LayoutMode } from "../src/shared/editor-domain/types";
import type { EditorMediaItem, TimelineMediaClip } from "../src/renderer/editor/types";

const cameraFrame = { x: 72, y: 50, size: 24 };

function item(
  id: string,
  track: EditorMediaItem["track"],
  channel?: number
): EditorMediaItem {
  return {
    id,
    name: `${id}.webm`,
    url: `ovc-media://${id}`,
    kind: "video",
    origin: "project",
    track,
    duration: 10,
    ...(channel === undefined ? {} : { channel })
  };
}

function clip(
  id: string,
  media: EditorMediaItem,
  lane: number,
  extra: Partial<TimelineMediaClip> = {}
): TimelineMediaClip {
  return {
    id,
    item: media,
    track: "video",
    lane,
    start: 0,
    duration: 10,
    sourceStart: 0,
    ...extra
  };
}

const screen = item("project:screen", "screen", 0);
const cameraOne = item("project:camera", "camera", 1);
const cameraTwo = item("project:camera-2", "camera", 2);
const imported = {
  ...item("imported-clip", "imported"),
  origin: "imported" as const
};

function composition(
  clips: TimelineMediaClip[],
  overrides: {
    time?: number;
    layoutMode?: LayoutMode;
    selectedSegmentId?: string | null;
    overlayCamera?: EditorMediaItem | null;
  } = {}
) {
  return resolvePreviewComposition({
    clips,
    time: overrides.time ?? 3,
    projectLayout: overrides.layoutMode ?? "bubble",
    selectedSegmentId: overrides.selectedSegmentId ?? null,
    screenAspectRatio: "16:9",
    cameraFrame,
    overlayCamera: overrides.overlayCamera ?? null
  });
}

describe("composition roles", () => {
  it("puts screens, images and imported video on the base layer and webcams above it", () => {
    expect(compositionRoleForItem(screen)).toBe("base");
    expect(compositionRoleForItem(imported)).toBe("base");
    expect(compositionRoleForItem(cameraOne)).toBe("camera");
  });

  it("shows the next visible top channel after hiding the upper clip", () => {
    const secondScreen = item("project:screen-2", "screen", 2);
    const result = composition([
      { ...clip("screen", screen, 0), hidden: true },
      clip("screen-2", secondScreen, 1)
    ]);

    expect(result.primary?.id).toBe("screen-2");
    expect(result.base?.id).toBe("screen-2");
  });

  it("never renders a hidden webcam over the visible screen", () => {
    const result = composition([
      clip("screen", screen, 1),
      { ...clip("camera", cameraOne, 0), hidden: true }
    ]);

    expect(result.primary?.id).toBe("screen");
    expect(result.camera).toBeNull();
  });

  it("keeps the screen while a webcam channel sits on a lower lane", () => {
    const result = composition([
      clip("screen", screen, 2),
      clip("camera", cameraOne, 0)
    ]);

    expect(result.base?.id).toBe("screen");
    expect(result.camera?.id).toBe("camera");
    expect(result.primary?.id).toBe("screen");
  });
});

describe("choosing the webcam used by Layout", () => {
  const clips = [
    clip("screen", screen, 0),
    clip("camera-a", cameraOne, 1),
    clip("camera-b", cameraTwo, 2)
  ];

  it("uses the lowest visible webcam channel by default", () => {
    expect(composition(clips).camera?.id).toBe("camera-a");
  });

  it("uses the selected webcam clip when it is on screen", () => {
    const result = composition(clips, { selectedSegmentId: "camera-b" });
    expect(result.camera?.id).toBe("camera-b");
    expect(result.base?.id).toBe("screen");
  });

  it("ignores a selected screen clip and keeps the lowest webcam", () => {
    expect(composition(clips, { selectedSegmentId: "screen" }).camera?.id).toBe("camera-a");
  });

  it("falls back to the next visible webcam when the selected one is hidden", () => {
    const hidden = [
      clip("screen", screen, 0),
      { ...clip("camera-a", cameraOne, 1), hidden: true },
      clip("camera-b", cameraTwo, 2)
    ];

    const result = composition(hidden, { selectedSegmentId: "camera-a" });
    expect(result.camera?.id).toBe("camera-b");
  });

  it("falls through to the next visible webcam when the first one ends", () => {
    const cut = [
      clip("screen", screen, 0),
      clip("camera-a", cameraOne, 1, { duration: 2 }),
      clip("camera-b", cameraTwo, 2)
    ];

    expect(composition(cut, { time: 3 }).camera?.id).toBe("camera-b");
  });
});

describe("base layer fallback", () => {
  const secondScreen = item("project:screen-2", "screen", 1);

  it("shows the next visible base clip when the first screen channel is hidden", () => {
    const result = composition([
      { ...clip("screen", screen, 0), hidden: true },
      clip("screen-2", secondScreen, 1),
      clip("camera", cameraOne, 2)
    ]);

    expect(result.base?.id).toBe("screen-2");
    expect(result.camera?.id).toBe("camera");
  });

  it("still composes the visible webcam when no base clip covers the moment", () => {
    const result = composition([clip("camera", cameraOne, 1)], {
      layoutMode: "camera-only"
    });

    expect(result.base).toBeNull();
    expect(result.camera?.id).toBe("camera");
    expect(result.primary?.id).toBe("camera");
    expect(result.showNoCameraRecording).toBe(false);
  });
});

describe("imported video as the base layer", () => {
  it("composes the webcam above an imported clip instead of a plain video", () => {
    const result = composition([
      clip("imported", imported, 0),
      clip("camera", cameraOne, 1)
    ]);

    expect(result.base?.id).toBe("imported");
    expect(result.camera?.id).toBe("camera");
    expect(result.layout.camera).not.toBeNull();
  });

  it("keeps presets applied to an imported clip alone", () => {
    const result = composition([clip("imported", imported, 0)], { layoutMode: "presenter" });

    expect(result.base?.id).toBe("imported");
    expect(result.layout.base).not.toBeNull();
    expect(result.layout.base?.fit).toBe("contain");
  });
});

describe("layout presets with several layers", () => {
  const clipSet = [clip("screen", screen, 0), clip("camera", cameraOne, 1)];
  const modes: LayoutMode[] = [
    "screen-only",
    "camera-only",
    "bubble",
    "bubble-fill",
    "presenter",
    "side-by-side",
    "side-overlap"
  ];

  it("resolves geometry for every preset", () => {
    for (const layoutMode of modes) {
      const layout = composition(clipSet, { layoutMode }).layout;
      expect(
        layout.base === null && layout.camera === null,
        `${layoutMode} must render at least one layer`
      ).toBe(false);
    }
  });

  it("hides the webcam and keeps the screen for screen-only", () => {
    const layout = composition(clipSet, { layoutMode: "screen-only" }).layout;
    expect(layout.camera).toBeNull();
    expect(layout.base).toEqual({
      frame: { x: 6, y: 6, width: 88, height: 88 },
      fit: "contain"
    });
  });

  it("fills the frame with the webcam for camera-only", () => {
    const layout = composition(clipSet, { layoutMode: "camera-only" }).layout;
    expect(layout.base).toBeNull();
    expect(layout.camera).toEqual({
      frame: { x: 0, y: 0, width: 100, height: 100 },
      fit: "cover"
    });
  });

  it("insets the screen and floats the webcam for bubble presets", () => {
    const bubble = composition(clipSet, { layoutMode: "bubble" }).layout;
    expect(bubble.base?.fit).toBe("contain");
    expect((bubble.base?.frame.x ?? 0) > 0).toBe(true);
    expect(bubble.camera?.frame.x).toBe(72);
    expect(bubble.camera?.frame.width).toBe(24);
    // A square webcam box on a 16:9 frame is taller than it is wide.
    expect(bubble.camera?.frame.height).toBeCloseTo(24 * (16 / 9), 5);

    const filled = composition(clipSet, { layoutMode: "bubble-fill" }).layout;
    expect(filled.base).toEqual({
      frame: { x: 0, y: 0, width: 100, height: 100 },
      fit: "cover"
    });
    expect(filled.camera?.frame.width).toBe(24);
  });

  it("reserves the left half for the webcam when split", () => {
    const layout = composition(clipSet, { layoutMode: "side-by-side" }).layout;
    expect(layout.base).toEqual({
      frame: { x: 40, y: 0, width: 60, height: 100 },
      fit: "cover"
    });
    expect(layout.camera).toEqual({
      frame: { x: 0, y: 0, width: 40, height: 100 },
      fit: "cover"
    });
  });

  it("keeps a presenter screen inset with the webcam floating on top", () => {
    const layout = composition(clipSet, { layoutMode: "presenter" }).layout;
    expect(layout.base).toEqual({
      frame: { x: 6, y: 16, width: 60, height: 60 },
      fit: "contain"
    });
    expect(layout.camera?.frame.width).toBe(24);
  });

  it("keeps the overlap preset screen inset and the webcam floating", () => {
    const layout = composition(clipSet, { layoutMode: "side-overlap" }).layout;
    expect(layout.base).toEqual({
      frame: { x: 36, y: 18, width: 60, height: 60 },
      fit: "contain"
    });
    expect(layout.camera?.frame.width).toBe(24);
  });
});

describe("layout per clip", () => {
  it("lets the base clip override the project layout while it is on screen", () => {
    const result = composition(
      [clip("screen", screen, 0, { layout: "side-by-side" }), clip("camera", cameraOne, 1)],
      { layoutMode: "bubble" }
    );

    expect(result.layoutMode).toBe("side-by-side");
    expect(result.layout.base?.frame.x).toBe(40);
  });

  it("lets the webcam clip override the layout when the base clip has none", () => {
    const result = composition(
      [clip("screen", screen, 0), clip("camera", cameraOne, 1, { layout: "presenter" })],
      { layoutMode: "bubble" }
    );

    expect(result.layoutMode).toBe("presenter");
  });

  it("keeps the project layout when no clip overrides it", () => {
    expect(composition([clip("screen", screen, 0)], { layoutMode: "presenter" }).layoutMode)
      .toBe("presenter");
  });
});

describe("single-camera overlay on legacy projects", () => {
  it("still shows the floating webcam that has no timeline channel", () => {
    const overlayCamera = item("project:camera", "camera");
    const result = composition([clip("screen", screen, 0)], { overlayCamera });

    expect(result.camera).toBeNull();
    expect(result.cameraItem?.id).toBe("project:camera");
    expect(result.showNoCameraRecording).toBe(false);
  });

  it("prefers the timeline webcam over the legacy overlay", () => {
    const overlayCamera = item("project:camera", "camera");
    const result = composition([clip("screen", screen, 0), clip("camera-2", cameraTwo, 1)], {
      overlayCamera
    });

    expect(result.cameraItem?.id).toBe("project:camera-2");
  });
});

describe("no camera recording placeholder", () => {
  it("keeps the shipped wording of the placeholder", () => {
    expect(noCameraRecordingMessage).toBe("No camera recording for this project.");
  });

  it("only appears for a camera-only layout without any webcam", () => {
    expect(shouldShowNoCameraRecording("camera-only", false)).toBe(true);
    expect(shouldShowNoCameraRecording("camera-only", true)).toBe(false);
    expect(shouldShowNoCameraRecording("bubble", false)).toBe(false);
    expect(shouldShowNoCameraRecording("screen-only", false)).toBe(false);
  });

  it("does not appear in a multi-camera project", () => {
    const result = composition(
      [clip("screen", screen, 0), clip("camera", cameraOne, 1), clip("camera-2", cameraTwo, 2)],
      { layoutMode: "camera-only" }
    );

    expect(result.showNoCameraRecording).toBe(false);
  });
});

describe("preset geometry shared with the exporter", () => {
  it("uses the composition frame aspect for the square webcam box", () => {
    const layout = getCompositionLayout({
      layoutMode: "bubble",
      screenAspectRatio: "16:9",
      cameraFrame,
      frameAspect: 9 / 16
    });

    expect(layout.camera?.frame.height).toBeCloseTo(24 * (9 / 16), 5);
  });
});

describe("webcam border shared with the exporter", () => {
  it("paints the chosen border with the preview thickness and colour", () => {
    expect(resolveCameraBorder({ layoutMode: "bubble", borderStyle: "light" })).toEqual({
      colorHex: "ffffff",
      cssWidth: 4
    });
    expect(resolveCameraBorder({ layoutMode: "bubble", borderStyle: "accent" })).toEqual({
      colorHex: "f9a916",
      cssWidth: 3
    });
  });

  it("draws no border for the none style", () => {
    expect(resolveCameraBorder({ layoutMode: "bubble", borderStyle: "none" })).toBeNull();
  });

  it("draws no border on the split preset, exactly like the preview", () => {
    expect(resolveCameraBorder({ layoutMode: "side-by-side", borderStyle: "light" })).toBeNull();
    expect(resolveCameraBorder({ layoutMode: "side-by-side", borderStyle: "accent" })).toBeNull();
  });
});
