/** Preset and custom cubic Bezier controls for a selected zoom effect. */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampNumber } from "../utils";
import { applyZoomEasing } from "../zoom-utils";
import type { ZoomEasing, ZoomEffect } from "../types";
import { ZoomCurvePreview } from "./ZoomCurvePreview";

type Bezier = [number, number, number, number];

const easingPresets: Array<{
  id: Exclude<ZoomEasing, "custom">;
  label: string;
  bezier: Bezier;
}> = [
  { id: "linear", label: "Linear", bezier: [0, 0, 1, 1] },
  { id: "ease-in", label: "Ease in", bezier: [0.42, 0, 1, 1] },
  { id: "ease-out", label: "Ease out", bezier: [0, 0, 0.58, 1] },
  { id: "ease-in-out", label: "Smooth", bezier: [0.42, 0, 0.58, 1] }
];

const defaultBezier: Bezier = [0.42, 0, 0.58, 1];

export function ZoomCurveEditor(props: {
  effect: ZoomEffect;
  onChange: (updates: Partial<ZoomEffect>) => void;
  onPreviewProgress: (progress: number | null) => void;
}) {
  const easing = props.effect.easing ?? "ease-in-out";
  const bezier = props.effect.bezier ?? defaultBezier;
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewRafRef = useRef<number | null>(null);
  const previewEndRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (previewRafRef.current !== null) {
        window.cancelAnimationFrame(previewRafRef.current);
      }
      if (previewEndRef.current !== null) {
        window.clearTimeout(previewEndRef.current);
      }
    },
    []
  );

  function changeAndPreview(updates: Partial<ZoomEffect>) {
    props.onChange(updates);
    if (previewRafRef.current !== null) {
      return;
    }
    if (previewEndRef.current !== null) {
      window.clearTimeout(previewEndRef.current);
      previewEndRef.current = null;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      setPreviewProgress(progress);
      props.onPreviewProgress(progress);
      if (progress < 1) {
        previewRafRef.current = window.requestAnimationFrame(tick);
      } else {
        previewRafRef.current = null;
        previewEndRef.current = window.setTimeout(() => {
          props.onPreviewProgress(null);
          previewEndRef.current = null;
        }, 250);
      }
    };
    previewRafRef.current = window.requestAnimationFrame(tick);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold text-slate-400">Zoom curve</span>
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-violet-300">
          {easing}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
        {easingPresets.map((preset) => (
          <CurveButton
            key={preset.id}
            active={easing === preset.id}
            label={preset.label}
            bezier={preset.bezier}
            onClick={() => changeAndPreview({ easing: preset.id, bezier: preset.bezier })}
          />
        ))}
        <CurveButton
          active={easing === "custom"}
          className="col-span-full"
          label="Custom curve"
          bezier={bezier}
          onClick={() => changeAndPreview({ easing: "custom", bezier })}
        />
      </div>

      {easing === "custom" ? (
        <div className="grid gap-2 rounded-xl bg-white/[0.04] p-3">
          <CurveCanvas
            bezier={bezier}
            progress={previewProgress}
            onChange={(next) => changeAndPreview({ easing: "custom", bezier: next })}
          />
          <code className="text-right text-[0.65rem] font-semibold tabular-nums text-slate-500">
            cubic-bezier({bezier.map((value) => value.toFixed(2)).join(", ")})
          </code>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Direct-manipulation Bezier editor: the two control points are dragged
 * straight on the curve surface instead of via sliders.
 */
function CurveCanvas(props: {
  bezier: Bezier;
  progress: number;
  onChange: (next: Bezier) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragPointRef = useRef<0 | 1 | null>(null);
  const [x1, y1, x2, y2] = props.bezier;
  const eased = applyZoomEasing(props.progress, { easing: "custom", bezier: props.bezier });

  function applyDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    const point = dragPointRef.current;
    if (!surface || point === null) {
      return;
    }

    const bounds = surface.getBoundingClientRect();
    const x = clampNumber((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clampNumber(1 - (event.clientY - bounds.top) / bounds.height, 0, 1);
    const next = [...props.bezier] as Bezier;
    next[point * 2] = Math.round(x * 100) / 100;
    next[point * 2 + 1] = Math.round(y * 100) / 100;
    props.onChange(next);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = surface.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const distanceTo = (x: number, y: number) =>
      Math.hypot(pointerX - x * bounds.width, pointerY - (1 - y) * bounds.height);
    dragPointRef.current = distanceTo(x1, y1) <= distanceTo(x2, y2) ? 0 : 1;
    applyDrag(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragPointRef.current !== null) {
      applyDrag(event);
    }
  }

  function handlePointerUp() {
    dragPointRef.current = null;
  }

  return (
    <div
      className="h-24 w-full cursor-crosshair touch-none rounded-lg bg-black/30 p-2 text-violet-300"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="relative size-full" ref={surfaceRef}>
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 100 L100 0"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="2"
            strokeDasharray="5 6"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M0 100 L${x1 * 100} ${(1 - y1) * 100}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M100 0 L${x2 * 100} ${(1 - y2) * 100}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M0 100 C${x1 * 100} ${(1 - y1) * 100}, ${x2 * 100} ${(1 - y2) * 100}, 100 0`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <CurveHandle x={x1} y={y1} />
        <CurveHandle x={x2} y={y2} />
        {props.progress > 0 && props.progress < 1 ? (
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgb(167_139_250_/_0.8)]"
            style={{ left: `${props.progress * 100}%`, top: `${(1 - eased) * 100}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function CurveHandle(props: { x: number; y: number }) {
  return (
    <span
      className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-violet-300 bg-white shadow-[0_1px_6px_rgb(0_0_0_/_0.45)]"
      style={{ left: `${props.x * 100}%`, top: `${(1 - props.y) * 100}%` }}
    />
  );
}

function CurveButton(props: {
  active: boolean;
  bezier: Bezier;
  className?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${props.className ?? ""} editor-choice-button grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold ${
        props.active
          ? "bg-white text-black"
          : "bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <ZoomCurvePreview bezier={props.bezier} />
      {props.label}
    </button>
  );
}
