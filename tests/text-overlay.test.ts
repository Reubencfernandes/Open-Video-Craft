import { describe, expect, it } from "vitest";
import { getTextOverlayStyle } from "../src/renderer/editor/TextOverlayLayer";
import type { TextOverlay } from "../src/renderer/editor/types";

const overlay: TextOverlay = {
  id: "title",
  start: 2,
  end: 5,
  text: "Product update",
  x: 35,
  y: 20,
  size: 72,
  color: "#38bdf8",
  fontFamily: "mono",
  opacity: 70,
  weight: 700,
  animation: "pop"
};

describe("callout box preview", () => {
  const callout: TextOverlay = {
    ...overlay,
    title: "TOPIC",
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

  it("uses the custom panel style and fades out before the end", () => {
    const entering = getTextOverlayStyle(callout, 2.15);
    const settled = getTextOverlayStyle(callout, 3);
    const exiting = getTextOverlayStyle(callout, 4.9);

    expect(entering.backgroundColor).toContain("18, 60, 143");
    expect(entering.borderRadius).toBe("18px");
    expect(entering.border).toContain("#66b3ff");
    expect(Number(settled.opacity)).toBeGreaterThan(0.6);
    expect(Number(exiting.opacity)).toBeLessThan(Number(settled.opacity));
  });
});

describe("text overlay preview animation", () => {
  it("derives placement and entrance animation from timeline time", () => {
    const entering = getTextOverlayStyle(overlay, 2.2);
    const settled = getTextOverlayStyle(overlay, 3);

    expect(entering.left).toBe("35%");
    expect(entering.top).toBe("20%");
    expect(entering.fontFamily).toContain("SFMono");
    expect(entering.opacity).toBeCloseTo(0.35);
    expect(entering.transform).toContain("scale(0.86");
    expect(settled.opacity).toBe(0.7);
    expect(settled.transform).toContain("scale(1)");
  });
});
