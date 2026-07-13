/**
 * Speed tool: add speed regions and edit the selected region's rate/timing.
 */
import { Trash2 } from "lucide-react";
import { speedRates } from "../speed-utils";
import { SpeedIcon } from "../SpeedIcon";
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
        <SpeedIcon size={16} />
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

          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-black transition hover:bg-slate-200"
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
