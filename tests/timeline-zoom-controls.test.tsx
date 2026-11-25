// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TimelineToolbar } from "../src/renderer/editor/TimelineChrome";
import {
  getTimelineZoomAfterShortcut,
  getTimelineZoomAfterWheel
} from "../src/renderer/editor/useTimelineViewport";

describe("timeline zoom controls", () => {
  it("renders a bounded zoom slider with an accessible label", () => {
    const html = renderToStaticMarkup(createElement(TimelineToolbar, {
      timelineZoom: 3,
      canSplit: false,
      canDelete: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onSplit: vi.fn(),
      onDelete: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomReset: vi.fn(),
      onZoomChange: vi.fn()
    }));

    expect(html).toContain('aria-label="Timeline zoom"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="10"');
    expect(html).toContain("300%");
  });

  it("clamps wheel zoom to the documented range", () => {
    expect(getTimelineZoomAfterWheel(10, -100)).toBe(10);
    expect(getTimelineZoomAfterWheel(1, 100)).toBe(1);
  });

  it("supports zoom in, out and fit shortcuts", () => {
    expect(getTimelineZoomAfterShortcut(2, "in")).toBe(3);
    expect(getTimelineZoomAfterShortcut(2, "out")).toBeCloseTo(1.333, 2);
    expect(getTimelineZoomAfterShortcut(5, "fit")).toBe(1);
  });
});
