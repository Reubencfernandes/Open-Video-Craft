/** Controls for adding, styling, positioning, and timing freeform text. */
import { GripVertical, Trash2, Type } from "lucide-react";
import { textDragType } from "../types";
import type { TextAnimation, TextOverlay } from "../types";

const animationOptions: Array<{ value: TextAnimation; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade in" },
  { value: "pop", label: "Pop" },
  { value: "slide-up", label: "Slide up" }
];

export function TextPanel(props: {
  overlays: TextOverlay[];
  selectedOverlay: TextOverlay | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TextOverlay>) => void;
  onRemove: (id: string) => void;
}) {
  const selected = props.selectedOverlay;

  return (
    <div className="grid min-h-0 content-start gap-3 overflow-auto">
      {/* Text is placed by dropping this tile onto the timeline's Text track,
          matching how media assets are added. */}
      <div
        className="grid cursor-grab justify-items-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.055] px-3 py-3 text-center active:cursor-grabbing hover:bg-white/10"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(textDragType, "new");
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <GripVertical size={16} className="text-slate-500" />
          <Type size={16} className="text-sky-300" /> Text
        </span>
        <span className="text-[0.68rem] font-semibold text-slate-400">
          Drag onto the timeline to add
        </span>
      </div>

      <div className="grid gap-1.5">
        {props.overlays.map((overlay) => (
          <button
            className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
              selected?.id === overlay.id
                ? "bg-sky-400/15 text-white ring-1 ring-sky-300/40"
                : "bg-white/[0.035] text-slate-400 hover:bg-white/[0.07] hover:text-white"
            }`}
            type="button"
            key={overlay.id}
            onClick={() => props.onSelect(overlay.id)}
          >
            <Type size={14} className="flex-none text-sky-300" />
            <span className="min-w-0 flex-1 truncate">{overlay.text || "Empty text"}</span>
            <span className="flex-none tabular-nums text-[0.62rem] text-slate-500">
              {overlay.start.toFixed(1)}s
            </span>
          </button>
        ))}
      </div>

      {!selected ? (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs leading-5 text-slate-500">
          Drag the text tile onto the timeline, or select a text layer to edit it.
        </div>
      ) : (
        <div className="grid gap-3 border-t border-white/10 pt-3">
          <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
            Text
            <textarea
              className="min-h-20 resize-y rounded-lg border border-white/10 bg-black/20 p-2.5 text-sm font-semibold text-white outline-none focus:border-sky-400"
              value={selected.text}
              onChange={(event) => props.onUpdate(selected.id, { text: event.target.value })}
            />
          </label>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            <NumberField label="Start" value={selected.start} onChange={(start) => props.onUpdate(selected.id, { start })} />
            <NumberField label="End" value={selected.end} onChange={(end) => props.onUpdate(selected.id, { end })} />
          </div>

          <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
            Animation
            <select
              className="h-9 rounded-lg text-xs font-semibold"
              value={selected.animation}
              onChange={(event) => props.onUpdate(selected.id, { animation: event.target.value as TextAnimation })}
            >
              {animationOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>

          <RangeField label="Horizontal" value={selected.x} min={0} max={100} suffix="%" onChange={(x) => props.onUpdate(selected.id, { x })} />
          <RangeField label="Vertical" value={selected.y} min={0} max={100} suffix="%" onChange={(y) => props.onUpdate(selected.id, { y })} />
          <RangeField label="Size" value={selected.size} min={12} max={160} suffix="px" onChange={(size) => props.onUpdate(selected.id, { size })} />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
              Color
              <input
                className="h-9 w-full rounded-lg border border-white/10 bg-black/20 p-1"
                type="color"
                value={selected.color}
                onChange={(event) => props.onUpdate(selected.id, { color: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
              Weight
              <select
                className="h-9 rounded-lg text-xs font-semibold"
                value={selected.weight}
                onChange={(event) => props.onUpdate(selected.id, { weight: Number(event.target.value) as TextOverlay["weight"] })}
              >
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
                <option value={800}>Extra bold</option>
              </select>
            </label>
          </div>

          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-rose-500/10 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
            type="button"
            onClick={() => props.onRemove(selected.id)}
          >
            <Trash2 size={14} /> Remove text
          </button>
        </div>
      )}
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
      {props.label}
      <input
        className="h-9 min-w-0 rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-white outline-none focus:border-sky-400"
        type="number"
        min={0}
        step={0.1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-[0.68rem] font-semibold text-slate-400">
      <span className="flex justify-between"><span>{props.label}</span><span>{Math.round(props.value)}{props.suffix}</span></span>
      <input type="range" min={props.min} max={props.max} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}
