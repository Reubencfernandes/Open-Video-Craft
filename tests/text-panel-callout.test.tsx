// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TextPanel } from "../src/renderer/editor/panels/TextPanel";
import type { TextOverlay } from "../src/shared/editor-domain";

const callout: TextOverlay = {
  id: "callout-1",
  start: 1,
  end: 3,
  text: "Body",
  title: "TOPIC",
  x: 50,
  y: 25,
  size: 48,
  color: "#ffffff",
  fontFamily: "mono",
  weight: 700,
  animation: "slide-in-out",
  box: {
    backgroundColor: "#123c8f",
    backgroundOpacity: 72,
    borderColor: "#66b3ff",
    borderWidth: 3,
    borderRadius: 18,
    padding: 22,
    titleColor: "#9fd1ff",
    titleSize: 26
  }
};

describe("TextPanel callout controls", () => {
  it("exposes title, panel style and in/out animation controls", () => {
    const html = renderToStaticMarkup(createElement(TextPanel, {
      overlays: [callout],
      selectedOverlayId: callout.id,
      selectedOverlay: callout,
      onAdd: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onRemove: vi.fn()
    }));

    expect(html).toContain('aria-label="Callout title"');
    expect(html).toContain('aria-label="Background color"');
    expect(html).toContain('aria-label="Border radius"');
    expect(html).toContain("Slide in/out");
  });
});
