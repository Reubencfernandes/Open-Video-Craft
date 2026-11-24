// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  filmstripMaxFrames,
  filmstripMaxTiles,
  filmstripMinFrames,
  findNearestFilmstripFrame,
  getFilmstripSampleTimes,
  getFilmstripTiles,
  getProgressiveCaptureOrder,
  type FilmstripFrame
} from "../src/renderer/editor/filmstrip";
import { VideoFilmstrip } from "../src/renderer/editor/VideoFilmstrip";

/** One frame per second of a 90 s video, src naming its own second. */
const frames: FilmstripFrame[] = Array.from({ length: 90 }, (_, second) => ({
  time: second + 0.5,
  src: `frame-${second}`
}));

describe("filmstrip sampling", () => {
  it("spreads samples across the whole video, centred in equal slots", () => {
    expect(getFilmstripSampleTimes(30)).toHaveLength(15);
    expect(getFilmstripSampleTimes(30)[0]).toBe(1);
    expect(getFilmstripSampleTimes(30)[14]).toBe(29);
    expect(getFilmstripSampleTimes(3)).toHaveLength(filmstripMinFrames);
    expect(getFilmstripSampleTimes(3600)).toHaveLength(filmstripMaxFrames);
    expect(getFilmstripSampleTimes(Number.NaN)).toEqual([]);
  });

  it("captures coarse frames across the video before filling the gaps", () => {
    const order = getProgressiveCaptureOrder(20);
    expect(order.slice(0, 3)).toEqual([0, 8, 16]);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("finds the frame closest to a source time", () => {
    expect(findNearestFilmstripFrame(frames, 41.2)?.src).toBe("frame-41");
    expect(findNearestFilmstripFrame(frames, -5)?.src).toBe("frame-0");
    expect(findNearestFilmstripFrame(frames, 500)?.src).toBe("frame-89");
    expect(findNearestFilmstripFrame([], 3)).toBeNull();
  });
});

describe("filmstrip tiles", () => {
  it("shows a trimmed clip's own footage, not the whole recording", () => {
    // A clip trimmed to source 60–70 s: every tile must come from that range.
    const tiles = getFilmstripTiles({
      frames,
      sourceStart: 60,
      sourceDuration: 10,
      widthPx: 640,
      tileWidthPx: 64
    });
    expect(tiles).toHaveLength(10);
    expect(tiles[0].src).toBe("frame-60");
    expect(tiles[9].src).toBe("frame-69");
    expect(tiles.every((tile) => tile.widthPx === 64)).toBe(true);
  });

  it("adds fixed-size tiles when the timeline is zoomed instead of stretching them", () => {
    const normal = getFilmstripTiles({ frames, sourceStart: 0, sourceDuration: 90, widthPx: 900, tileWidthPx: 64 });
    const zoomed = getFilmstripTiles({ frames, sourceStart: 0, sourceDuration: 90, widthPx: 3600, tileWidthPx: 64 });
    expect(zoomed.length).toBeGreaterThan(normal.length * 3);
    expect(zoomed[0].widthPx).toBe(64);
    expect(new Set(zoomed.map((tile) => tile.src)).size).toBeGreaterThan(new Set(normal.map((tile) => tile.src)).size);
  });

  it("caps the tile count at extreme zoom", () => {
    const tiles = getFilmstripTiles({ frames, sourceStart: 0, sourceDuration: 90, widthPx: 100_000, tileWidthPx: 64 });
    expect(tiles).toHaveLength(filmstripMaxTiles);
    expect(tiles[0].widthPx).toBeCloseTo(100_000 / filmstripMaxTiles);
  });

  it("spreads flexible tiles over the clip before its width is measured", () => {
    const tiles = getFilmstripTiles({ frames, sourceStart: 30, sourceDuration: 10, widthPx: 0, tileWidthPx: 0 });
    expect(tiles).toHaveLength(10);
    expect(tiles[0]).toMatchObject({ src: "frame-30", widthPx: null });
    expect(tiles[9].src).toBe("frame-39");
  });

  it("renders the clip's frames in the timeline component", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(createElement(VideoFilmstrip, { frames, sourceStart: 60, sourceDuration: 10 })));
    const sources = [...host.querySelectorAll("img")].map((image) => image.getAttribute("src"));
    expect(sources[0]).toBe("frame-60");
    expect(sources.every((src) => Number(src?.slice(6)) >= 60 && Number(src?.slice(6)) < 70)).toBe(true);
    root.unmount();
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
