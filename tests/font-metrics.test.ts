import { describe, expect, it } from "vitest";
import {
  loadFontMetrics,
  measureTextWidth,
  parseFontMetrics,
  wrapTextToWidth
} from "../src/main/font-metrics";
import { resolveOverlayFontFile } from "../src/main/overlay-fonts";

const interBold = () => {
  const metrics = loadFontMetrics(resolveOverlayFontFile(700)!);
  expect(metrics).not.toBeNull();
  return metrics!;
};

describe("font metrics", () => {
  it("reads the bundled font's em size and glyph coverage", () => {
    const metrics = interBold();

    expect(metrics.unitsPerEm).toBe(2048);
    // Enough of Latin to lay out overlay text without guessing.
    expect(metrics.advanceByCodePoint.size).toBeGreaterThan(200);
    for (const character of "AZaz 0.,-—") {
      expect(metrics.advanceByCodePoint.has(character.codePointAt(0)!)).toBe(true);
    }
  });

  it("reports a line height near one and a quarter em", () => {
    const metrics = interBold();
    const ratio = metrics.lineHeight / metrics.unitsPerEm;

    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.5);
  });

  it("scales width with font size and text length", () => {
    const metrics = interBold();
    const short = measureTextWidth("Hi", 48, metrics);
    const long = measureTextWidth("Hi there, everyone", 48, metrics);

    expect(long).toBeGreaterThan(short);
    expect(measureTextWidth("Hi", 96, metrics)).toBeCloseTo(short * 2, 5);
    expect(measureTextWidth("", 48, metrics)).toBe(0);
  });

  it("gives a wider advance to a wider glyph", () => {
    const metrics = interBold();

    expect(measureTextWidth("W", 48, metrics)).toBeGreaterThan(
      measureTextWidth("i", 48, metrics)
    );
  });

  it("keeps every wrapped line inside the limit", () => {
    const metrics = interBold();
    const text = "The user logs in with Instagram and approves the requested permissions";
    const limit = 300;

    const lines = wrapTextToWidth(text, limit, 24, metrics).split("\n");

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWidth(line, 24, metrics)).toBeLessThanOrEqual(limit);
    }
    expect(lines.join(" ")).toBe(text);
  });

  it("preserves newlines the author typed", () => {
    const metrics = interBold();

    expect(wrapTextToWidth("one\ntwo", 10_000, 24, metrics)).toBe("one\ntwo");
  });

  it("lets a word wider than the limit overflow rather than splitting it", () => {
    const metrics = interBold();

    const lines = wrapTextToWidth("shortish enormouslylongunbreakableword", 40, 24, metrics)
      .split("\n");

    expect(lines).toContain("enormouslylongunbreakableword");
  });

  it("returns null for data that is not a font", () => {
    expect(parseFontMetrics(Buffer.alloc(0))).toBeNull();
    expect(parseFontMetrics(Buffer.from("not a font at all, truly"))).toBeNull();
  });

  it("returns null for a missing file instead of throwing", () => {
    expect(loadFontMetrics("/nonexistent/Inter-Regular.ttf")).toBeNull();
  });
});
