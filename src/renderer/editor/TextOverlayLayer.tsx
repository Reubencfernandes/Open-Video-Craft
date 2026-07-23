/** Timed freeform text rendered above the video composition. */
import { useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { TextOverlay } from "./types";
import { clampNumber } from "./utils";

const textFontStacks: Record<NonNullable<TextOverlay["fontFamily"]>, string> = {
  sans: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  rounded: "'SF Pro Rounded', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
};

export function TextOverlayLayer(props: {
  overlays: TextOverlay[];
  currentTime: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    bounds: DOMRect;
  } | null>(null);
  const active = props.overlays.filter(
    (overlay) => props.currentTime >= overlay.start && props.currentTime <= overlay.end
  );

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, overlay: TextOverlay) {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    props.onSelect(overlay.id);
    dragRef.current = { id: overlay.id, pointerId: event.pointerId, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    props.onMove(
      drag.id,
      clampNumber((event.clientX - drag.bounds.left) / drag.bounds.width * 100, 0, 100),
      clampNumber((event.clientY - drag.bounds.top) / drag.bounds.height * 100, 0, 100)
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      {active.map((overlay) => (
        <button
          className={`pointer-events-auto absolute max-w-[90%] cursor-move touch-none whitespace-pre-wrap border border-transparent bg-transparent px-1 text-center leading-tight [text-shadow:0_2px_10px_rgb(0_0_0_/_0.9)] ${
            props.selectedId === overlay.id ? "rounded border-sky-300/80" : ""
          }`}
          type="button"
          data-text-overlay-id={overlay.id}
          key={overlay.id}
          style={getTextOverlayStyle(overlay, props.currentTime)}
          onPointerDown={(event) => beginDrag(event, overlay)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {overlay.text}
        </button>
      ))}
    </div>
  );
}

/** Deterministic animation styling keeps playback and timeline scrubbing aligned. */
export function getTextOverlayStyle(overlay: TextOverlay, currentTime: number): CSSProperties {
  const progress = clampNumber((currentTime - overlay.start) / 0.4, 0, 1);
  let opacity = 1;
  let scale = 1;
  let translateY = 0;
  if (overlay.animation === "fade") opacity = progress;
  if (overlay.animation === "pop") {
    opacity = progress;
    scale = 0.72 + progress * 0.28;
  }
  if (overlay.animation === "slide-up") {
    opacity = progress;
    translateY = (1 - progress) * 28;
  }

  return {
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    color: overlay.color,
    fontSize: `${overlay.size / 10.8}cqh`,
    fontFamily: textFontStacks[overlay.fontFamily ?? "sans"],
    fontWeight: overlay.weight,
    opacity: opacity * ((overlay.opacity ?? 100) / 100),
    transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${scale})`
  };
}
