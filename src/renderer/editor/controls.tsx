import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

/** Header strip at the top of the left tool panel (icon + tool name). */
export function ToolPanelHeader(props: { icon: ReactNode; title: string }) {
  return (
    <div className="tool-panel-header">
      <span>{props.icon}</span>
      <strong>{props.title}</strong>
      <button type="button" title="Panel options">
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
    <label className="range-control">
      <span>
        {props.label}
        <output>
          {props.value}
          {props.suffix}
        </output>
      </span>
      <input
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
