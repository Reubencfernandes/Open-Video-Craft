/**
 * Preview overlay for picking a zoom effect's focal point.
 */
import { AudioLines } from "lucide-react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { RangeControl } from "./controls";
import { clampNumber } from "./utils";
import type { EditorMediaItem, ZoomEffect } from "./types";

/**
 * Mini preview used by the Zoom tool: drag the dot over the frame to pick the
 * zoom focal point, and adjust the zoom scale with the slider below.
 */
export function ZoomTargetPanel(props: {
  item: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  onScaleChange: (scale: number) => void;
  onRegionChange: (region: { targetX: number; targetY: number; scale: number }) => void;
}) {
  const effect = props.selectedZoomEffect;
  const draggingRef = useRef(false);

  function moveTargetTo(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const targetX = clampNumber(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const targetY = clampNumber(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    props.onRegionChange({ targetX, targetY, scale: effect.scale });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    moveTargetTo(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (draggingRef.current) {
      moveTargetTo(event);
    }
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  return (
    <div className="grid gap-2">
      <span className="text-xs font-extrabold text-slate-400">
        Drag the dot to set what the zoom focuses on
      </span>
      <button
        className="relative grid aspect-video w-full cursor-move place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#24262b] p-0 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-55 [&>img]:size-full [&>img]:object-cover [&>video]:size-full [&>video]:object-cover"
        type="button"
        disabled={!effect}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {props.item?.kind === "image" ? (
          <img src={props.item.url} alt="" />
        ) : props.item?.kind === "video" ? (
          <video src={props.item.url} muted playsInline />
        ) : (
          <div className="grid size-full place-items-center text-slate-400">
            <AudioLines size={24} />
          </div>
        )}
        {effect ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_5px_18px_rgb(239_68_68_/_0.48)]"
            data-zoom-target-dot
            style={{
              left: `${effect.targetX}%`,
              top: `${effect.targetY}%`
            }}
          />
        ) : null}
      </button>
      <RangeControl
        label="Scale"
        min={125}
        max={300}
        value={Math.round((effect?.scale ?? 1.5) * 100)}
        suffix="%"
        disabled={!effect}
        onChange={(value) => props.onScaleChange(value / 100)}
      />
    </div>
  );
}
