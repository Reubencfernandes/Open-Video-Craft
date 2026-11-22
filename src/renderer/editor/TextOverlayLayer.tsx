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
          <span className="grid gap-1">
            {overlay.title ? (
              <strong
                className="block text-[0.62em] uppercase tracking-[0.18em]"
                style={{ color: overlay.box?.titleColor ?? overlay.color, fontSize: overlay.box ? `${overlay.box.titleSize / 10.8}cqh` : undefined }}
              >
                {overlay.title}
              </strong>
            ) : null}
            {overlay.text ? <span className="block">{overlay.text}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Deterministic animation styling keeps playback and timeline scrubbing aligned. */
export function getTextOverlayStyle(overlay: TextOverlay, currentTime: number): CSSProperties {
  const ramp = Math.min(0.4, Math.max(0.08, (overlay.end - overlay.start) / 2));
  const entrance = clampNumber((currentTime - overlay.start) / ramp, 0, 1);
  const hasExit = overlay.animation === "fade-in-out" || overlay.animation === "pop-in-out" || overlay.animation === "slide-in-out";
  const exit = hasExit ? clampNumber((overlay.end - currentTime) / ramp, 0, 1) : 1;
  const animationProgress = Math.min(entrance, exit);
  let opacity = 1;
  let scale = 1;
  let translateY = 0;
  if (overlay.animation === "fade" || overlay.animation === "fade-in-out") opacity = animationProgress;
  if (overlay.animation === "pop" || overlay.animation === "pop-in-out") {
    opacity = animationProgress;
    scale = 0.72 + animationProgress * 0.28;
  }
  if (overlay.animation === "slide-up" || overlay.animation === "slide-in-out") {
    opacity = animationProgress;
    translateY = (1 - entrance) * 28 - (1 - exit) * 18;
  }

  const box = overlay.box;
  const style: CSSProperties = {
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    color: overlay.color,
    fontSize: `${overlay.size / 10.8}cqh`,
    fontFamily: textFontStacks[overlay.fontFamily ?? "sans"],
    fontWeight: overlay.weight,
    opacity: opacity * ((overlay.opacity ?? 100) / 100),
    transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${scale})`
  };
  if (box) {
    style.backgroundColor = hexToRgba(box.backgroundColor, box.backgroundOpacity / 100);
    style.border = `${box.borderWidth}px solid ${box.borderColor}`;
    style.borderRadius = `${box.borderRadius}px`;
    style.padding = `${box.padding}px`;
    style.boxShadow = `0 10px 30px rgba(0, 0, 0, 0.35)`;
  }
  return style;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
