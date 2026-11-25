import { describe, expect, it } from "vitest";
import {
  appendCalloutBoxFilter,
  createCalloutBoxDrawboxFilter,
  createCalloutLayout
} from "../src/main/callout-filter";
import type { TimelineCompositionTextOverlay } from "../src/main/ffmpeg";

const overlay: TimelineCompositionTextOverlay = {
  id: "callout-export",
  start: 1,
  end: 8,
  text: "Zone aride e quasi disabitate, con piante e palme importate",
  title: "Un paesaggio da deserto",
  x: 50,
  y: 78,
  size: 34,
  color: "#ffffff",
  fontFamily: "sans",
  weight: 700,
  animation: "slide-in-out",
  box: {
    backgroundColor: "#1d4ed8",
    backgroundOpacity: 85,
    borderColor: "#ffffff",
    borderWidth: 0,
    borderRadius: 28,
    padding: 28,
    titleColor: "#ffffff",
    titleSize: 56
  }
};

describe("callout export layout", () => {
  it("sizes the panel from measured text instead of a fixed multiplier", () => {
    const layout = createCalloutLayout(overlay, 720, 1280);
    expect(layout.titleText).toBe("UN PAESAGGIO DA DESERTO");
    expect(layout.boxWidth).toBeGreaterThan(500);
    expect(layout.boxHeight).toBeGreaterThan(90);
    expect(layout.bodyY).toBeGreaterThan(layout.titleY);
  });

  it("draws a single translucent panel when border width is zero", () => {
    const filters: string[] = [];
    const label = appendCalloutBoxFilter(filters, "video", overlay, 720, 1280);
    const sources = filters.filter((filter) => filter.includes("color=c=black:s="));
    expect(sources).toHaveLength(1);
    expect(sources[0]).toContain("216.75*clip");
    expect(label).toBe("calloutexportPanel");
  });

  it("uses one drawbox for borderless fallback export", () => {
    const filter = createCalloutBoxDrawboxFilter(overlay, 720, 1280);
    expect(filter.match(/drawbox=/g)).toHaveLength(1);
    expect(filter).toContain("0x1d4ed8@0.85");
  });
});
