/**
 * Thumbnail strip inside a timeline video clip. Tiles keep a fixed 16:9 size,
 * so zooming the timeline adds tiles instead of stretching a few thumbnails,
 * and each tile shows the frame at the clip's own source time, so trimmed and
 * split clips show their own footage.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { getFilmstripTiles, type FilmstripFrame } from "./filmstrip";

export function VideoFilmstrip(props: {
  frames: FilmstripFrame[];
  sourceStart: number;
  sourceDuration: number;
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setSize((current) =>
        Math.abs(current.width - bounds.width) < 0.5 && Math.abs(current.height - bounds.height) < 0.5
          ? current
          : { width: bounds.width, height: bounds.height }
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tiles = getFilmstripTiles({
    frames: props.frames,
    sourceStart: props.sourceStart,
    sourceDuration: props.sourceDuration,
    widthPx: size.width,
    tileWidthPx: (size.height * 16) / 9
  });

  return (
    <span
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 flex overflow-hidden"
      aria-hidden="true"
      data-filmstrip-tiles={tiles.length}
    >
      {tiles.map((tile) => (
        <img
          className={`h-full min-w-0 border-r border-black/30 object-cover last:border-r-0 ${
            tile.widthPx === null ? "flex-1" : "flex-none"
          }`}
          style={tile.widthPx === null ? undefined : { width: tile.widthPx }}
          src={tile.src}
          alt=""
          draggable={false}
          key={tile.key}
        />
      ))}
      <span className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-black/35" />
    </span>
  );
}
