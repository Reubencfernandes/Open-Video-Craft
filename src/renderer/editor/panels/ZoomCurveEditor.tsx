/** Preset and custom cubic Bezier controls for a selected zoom effect. */
import type { ZoomEasing, ZoomEffect } from "../types";

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
}) {
  const easing = props.effect.easing ?? "ease-in-out";
  const bezier = props.effect.bezier ?? defaultBezier;

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
            onClick={() => props.onChange({ easing: preset.id, bezier: preset.bezier })}
          />
        ))}
        <CurveButton
          active={easing === "custom"}
          className="col-span-2"
          label="Custom curve"
          bezier={bezier}
          onClick={() => props.onChange({ easing: "custom", bezier })}
        />
      </div>

      {easing === "custom" ? (
        <div className="grid gap-3 rounded-xl bg-white/[0.04] p-3">
          <CurvePreview bezier={bezier} large />
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
                  props.onChange({ easing: "custom", bezier: next });
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
      <CurvePreview bezier={props.bezier} />
      {props.label}
    </button>
  );
}

function CurvePreview(props: { bezier: Bezier; large?: boolean }) {
  const [x1, y1, x2, y2] = props.bezier;
  return (
    <svg
      className={props.large ? "h-24 w-full rounded-lg bg-black/30 p-2 text-amber-300" : "h-7 w-10 text-current"}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 100 L100 0" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3" strokeDasharray="5 6" />
      <path d={`M0 100 C${x1 * 100} ${(1 - y1) * 100}, ${x2 * 100} ${(1 - y2) * 100}, 100 0`} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function getPointLabel(index: number): string {
  const point = Math.floor(index / 2) + 1;
  return `${index % 2 === 0 ? "X" : "Y"}${point}`;
}
