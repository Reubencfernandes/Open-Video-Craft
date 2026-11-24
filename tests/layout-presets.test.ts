// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  getLayoutPresetCameraFrame,
  getLayoutPresetDiagram,
  type PercentFrame
} from "../src/renderer/editor/layout-geometry";
import { LayoutPanel } from "../src/renderer/editor/panels/LayoutPanel";
import { StylePanel } from "../src/renderer/editor/panels/StylePanel";
import {
  applyEditorOperations,
  createDefaultEditorState,
  type LayoutMode
} from "../src/shared/editor-domain";

const layoutModes: LayoutMode[] = [
  "screen-only",
  "camera-only",
  "bubble",
  "bubble-fill",
  "side-by-side",
  "side-overlap",
  "presenter"
];

function overlaps(a: PercentFrame, b: PercentFrame): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("layout preset diagrams", () => {
  it("draws a different picture for every preset", () => {
    const pictures = layoutModes.map((mode) => JSON.stringify(getLayoutPresetDiagram(mode)));
    expect(new Set(pictures).size).toBe(layoutModes.length);
  });

  it("insets the screen for the fit bubble but fills the frame for the filled bubble", () => {
    const fit = getLayoutPresetDiagram("bubble");
    const fill = getLayoutPresetDiagram("bubble-fill");

    expect(fit.screen?.x).toBeGreaterThan(0);
    expect(fit.screen?.width).toBeLessThan(100);
    expect(fill.screen).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(fit.camera?.shape).toBe("circle");
    expect(fill.camera).toEqual(fit.camera);
  });

  it("shows the side-by-side camera as a full-height column left of the screen", () => {
    expect(getLayoutPresetDiagram("side-by-side")).toEqual({
      screen: { x: 40, y: 0, width: 60, height: 100 },
      camera: { x: 0, y: 0, width: 40, height: 100, shape: "rect" }
    });
  });

  it("overlaps the screen's left edge for split-left overlap", () => {
    const { screen, camera } = getLayoutPresetDiagram("side-overlap");
    expect(screen && camera).toBeTruthy();
    expect(camera!.x).toBeLessThan(screen!.x);
    expect(overlaps(camera!, screen!)).toBe(true);
  });

  it("puts the TV presenter beside the screen without covering it", () => {
    const { screen, camera } = getLayoutPresetDiagram("presenter");
    expect(camera!.x).toBeGreaterThan(screen!.x + screen!.width);
    expect(overlaps(camera!, screen!)).toBe(false);
  });

  it("matches the camera frame the preview uses for each preset", () => {
    for (const mode of ["bubble", "bubble-fill", "side-overlap", "presenter"] as const) {
      const frame = getLayoutPresetCameraFrame(mode, "bottom-right", 24);
      const camera = getLayoutPresetDiagram(mode).camera!;
      expect(camera.x).toBe(frame.x);
      expect(camera.y).toBe(frame.y);
      expect(camera.width).toBe(frame.size);
    }
  });
});

describe("set_layout operation", () => {
  it("moves the camera to where the chosen preset shows it", () => {
    const state = createDefaultEditorState();
    const presenter = applyEditorOperations(state, [{ type: "set_layout", layoutMode: "presenter" }]);
    expect(presenter.state.cameraFrame).toEqual(
      getLayoutPresetCameraFrame("presenter", state.cameraPosition, state.cameraSize)
    );

    const bubble = applyEditorOperations(presenter.state, [{ type: "set_layout", layoutMode: "bubble" }]);
    expect(bubble.state.cameraFrame).toEqual(
      getLayoutPresetCameraFrame("bubble", state.cameraPosition, state.cameraSize)
    );
  });
});

describe("video corner controls", () => {
  let root: ReturnType<typeof createRoot> | null = null;
  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
  });

  function render(element: ReturnType<typeof createElement>) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root?.render(element));
    return host;
  }

  function renderLayoutPanel(layoutMode: LayoutMode, onCornerStyleChange = vi.fn()) {
    const noop = vi.fn();
    return render(createElement(LayoutPanel, {
      layoutMode,
      screenScale: 100,
      screenAspectRatio: "auto",
      screenAspectEnabled: true,
      cameraShape: "circle",
      cameraBorderStyle: "light",
      cameraContentTransform: { x: 0, y: 0, scale: 100, mirrored: false },
      cameraPosition: "bottom-right",
      cameraSize: 24,
      videoCornerStyle: "soft",
      onLayoutModeChange: noop,
      onScreenScaleChange: noop,
      onScreenAspectRatioChange: noop,
      onCameraShapeChange: noop,
      onCameraBorderStyleChange: noop,
      onCameraContentTransformChange: noop,
      onCameraContentTransformReset: noop,
      onCameraPositionChange: noop,
      onCameraSizeChange: noop,
      onCornerStyleChange
    }));
  }

  it("lives in the Layout tool with the other screen-frame controls", () => {
    const onCornerStyleChange = vi.fn();
    const host = renderLayoutPanel("bubble", onCornerStyleChange);

    expect(host.textContent).toContain("Video corners");
    const rounded = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Rounded"
    );
    rounded?.click();
    expect(onCornerStyleChange).toHaveBeenCalledWith("round");
    expect(host.querySelectorAll("[data-layout-preset-diagram]")).toHaveLength(layoutModes.length);
  });

  it("is hidden when no screen recording is shown", () => {
    expect(renderLayoutPanel("camera-only").textContent).not.toContain("Video corners");
  });

  it("is no longer part of the Style tool", () => {
    const noop = vi.fn();
    const host = render(createElement(StylePanel, {
      activeCategory: "image",
      backgroundStyle: "real-world-1",
      onCategoryChange: noop,
      onBackgroundStyleChange: noop,
      onUploadCustomBackground: noop
    }));
    expect(host.textContent).not.toContain("Video corners");
  });
});
