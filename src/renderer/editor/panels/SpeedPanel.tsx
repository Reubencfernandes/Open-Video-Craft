import { Gauge, Trash2 } from "lucide-react";
import { speedMinDurationSeconds, speedRates } from "../speed-utils";
import type { SpeedEffect } from "../types";

export function SpeedPanel(props: {
  selectedSpeedEffect: SpeedEffect | null;
  onAddSpeed: () => void;
  onUpdateSpeed: (id: string, updates: Partial<SpeedEffect>) => void;
  onRemoveSpeed: (id: string) => void;
}) {
  const selected = props.selectedSpeedEffect;

  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-extrabold text-white hover:bg-white/10"
        type="button"
        onClick={props.onAddSpeed}
      >
        <Gauge size={16} />
        Add speed section
      </button>

      {selected ? (
        <>
          <div className="grid gap-2">
            <span className="text-xs font-extrabold text-slate-400">Playback speed</span>
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-white/[0.05] p-1">
              {speedRates.map((rate) => (
                <button
                  className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                    selected.rate === rate
                      ? "bg-white text-[#111827]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  type="button"
                  key={rate}
                  onClick={() => props.onUpdateSpeed(selected.id, { rate })}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-extrabold text-slate-400">
              <span>Start</span>
              <input
                className="h-9 rounded-md border border-white/10 bg-black/20 px-2 text-white"
                type="number"
                min={0}
                step={0.1}
                value={selected.start}
                onChange={(event) => {
                  if (!event.target.value.trim()) {
                    return;
                  }

                  props.onUpdateSpeed(selected.id, {
                    start: Math.max(0, Number(event.target.value))
                  });
                }}
              />
            </label>
            <label className="grid gap-1 text-xs font-extrabold text-slate-400">
              <span>End</span>
              <input
                className="h-9 rounded-md border border-white/10 bg-black/20 px-2 text-white"
                type="number"
                min={selected.start + speedMinDurationSeconds}
                step={0.1}
                value={selected.end}
                onChange={(event) => {
                  if (!event.target.value.trim()) {
                    return;
                  }

                  props.onUpdateSpeed(selected.id, {
                    end: Math.max(
                      selected.start + speedMinDurationSeconds,
                      Number(event.target.value)
                    )
                  });
                }}
              />
            </label>
          </div>

          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300/25 bg-red-500/15 px-3 text-sm font-extrabold text-red-100 hover:bg-red-500/25"
            type="button"
            onClick={() => props.onRemoveSpeed(selected.id)}
          >
            <Trash2 size={16} />
            Delete selected speed
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          Add a speed section, then pick 1x-5x and drag its box on the timeline.
        </div>
      )}
    </div>
  );
}
