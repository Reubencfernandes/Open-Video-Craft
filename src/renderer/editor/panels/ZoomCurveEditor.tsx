/** Preset and custom cubic Bezier controls for a selected zoom effect. */
import { useEffect, useRef, useState } from "react";
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
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-amber-300">
          {easing}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
          className="col-span-2"
          label="Custom curve"
          bezier={bezier}
          onClick={() => changeAndPreview({ easing: "custom", bezier })}
        />
      </div>

      {easing === "custom" ? (
        <div className="grid gap-3 rounded-xl bg-white/[0.04] p-3">
          <ZoomCurvePreview bezier={bezier} progress={previewProgress} large />
          {bezier.map((value, index) => (
            <label
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-[0.7rem] font-bold text-slate-400"
              key={index}
            >
              <span>{getPointLabel(index)}</span>
              <input
                className="w-full accent-amber-400"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value}
                onChange={(event) => {
                  const next = [...bezier] as Bezier;
                  next[index] = Number(event.target.value);
                  changeAndPreview({ easing: "custom", bezier: next });
                }}
              />
              <output className="text-right text-white tabular-nums">{value.toFixed(2)}</output>
            </label>
          ))}
        </div>
      ) : null}
    </div>
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
      className={`${props.className ?? ""} grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold transition ${
        props.active
          ? "bg-white text-black"
          : "bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
      type="button"
      onClick={props.onClick}
    >
      <ZoomCurvePreview bezier={props.bezier} />
      {props.label}
    </button>
  );
}

function getPointLabel(index: number): string {
  const point = Math.floor(index / 2) + 1;
  return `${index % 2 === 0 ? "X" : "Y"}${point}`;
}
