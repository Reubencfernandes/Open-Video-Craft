/**
 * Small shared controls: tool panel header and labeled range slider.
 */
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

/** Header strip at the top of the left tool panel (icon + tool name). */
export function ToolPanelHeader(props: { icon: ReactNode; title: string }) {
  return (
    <div className="flex min-h-[2.7rem] items-center gap-3 text-slate-100">
      <span className="inline-flex text-neutral-300">{props.icon}</span>
      <strong className="min-w-0 flex-1 truncate text-lg font-bold">{props.title}</strong>
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
  disabled?: boolean;
  formatValue?: (value: number) => ReactNode;
  onChange: (value: number) => void;
}) {
  const range = props.max - props.min;
  const progress = range > 0
    ? Math.min(100, Math.max(0, ((props.value - props.min) / range) * 100))
    : 0;

  return (
    <label
      className="group relative flex h-11 min-w-0 cursor-ew-resize items-center overflow-hidden rounded-xl bg-white/[0.055] px-3 text-xs font-bold text-neutral-400 ring-1 ring-inset ring-white/[0.045] transition hover:bg-white/[0.07] focus-within:ring-white/25 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
      data-range-control
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-xl bg-gradient-to-r from-white/[0.065] to-white/[0.105] transition-[width,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] group-hover:from-white/[0.08] group-hover:to-white/[0.12]"
        data-range-fill
        data-range-smooth
        style={{ width: `${progress}%` }}
      />
      <span className="pointer-events-none relative z-10 min-w-0 flex-1 truncate pr-3">
        {props.label}
      </span>
      <output className="pointer-events-none relative z-10 min-w-[3.5rem] text-right font-extrabold text-white tabular-nums">
        {props.formatValue ? props.formatValue(props.value) : <>{props.value}{props.suffix}</>}
      </output>
      <input
        aria-label={props.label}
        className="absolute inset-0 z-20 size-full cursor-ew-resize opacity-0 disabled:cursor-not-allowed"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}
