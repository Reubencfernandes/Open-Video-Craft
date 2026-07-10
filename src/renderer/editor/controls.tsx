/**
 * Small shared controls: tool panel header and labeled range slider.
 */
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

/** Header strip at the top of the left tool panel (icon + tool name). */
export function ToolPanelHeader(props: { icon: ReactNode; title: string }) {
  return (
    <div className="flex min-h-[2.7rem] items-center gap-3 text-slate-100">
      <span className="inline-flex text-cyan-300">{props.icon}</span>
      <strong className="min-w-0 flex-1 truncate text-xl font-extrabold">{props.title}</strong>
      <button
        className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-400 hover:bg-white/10 hover:text-white"
        type="button"
        title="Panel options"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

/** Labeled range slider with a live value readout (e.g. "Screen size 120%"). */
export function RangeControl(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-extrabold text-slate-400">
      <span className="flex items-center justify-between gap-3">
        {props.label}
        <output className="rounded-md bg-white/[0.06] px-2 py-1 text-white tabular-nums">
          {props.value}
          {props.suffix}
        </output>
      </span>
      <input
        className="w-full accent-amber-500"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}
