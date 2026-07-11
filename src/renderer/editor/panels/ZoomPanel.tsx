/** Zoom tool: create a region, choose its focus, speed, curve, or remove it. */
import { Trash2, WandSparkles } from "lucide-react";
import { ZoomTargetPanel } from "../ZoomTargetPanel";
import type { EditorMediaItem, ZoomEffect, ZoomSpeed } from "../types";
import { ZoomCurveEditor } from "./ZoomCurveEditor";

export function ZoomPanel(props: {
  previewItem: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  onAddZoom: () => void;
  onUpdateZoom: (id: string, updates: Partial<ZoomEffect>) => void;
  onRemoveZoom: (id: string) => void;
  onPreviewCurve: (effect: ZoomEffect, progress: number | null) => void;
}) {
  const selected = props.selectedZoomEffect;

  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-extrabold text-white hover:bg-white/10"
        type="button"
        onClick={props.onAddZoom}
      >
        <WandSparkles size={16} />
        Add smooth zoom
      </button>

      <ZoomTargetPanel
        item={props.previewItem}
        selectedZoomEffect={selected}
        onScaleChange={(scale) => selected && props.onUpdateZoom(selected.id, { scale })}
        onRegionChange={(region) => selected && props.onUpdateZoom(selected.id, region)}
      />

      {selected ? (
        <>
          <div className="grid gap-2">
            <span className="text-xs font-extrabold text-slate-400">Zoom speed</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
              {(["slow", "medium", "fast"] as ZoomSpeed[]).map((speed) => (
                <button
                  className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                    selected.speed === speed
                      ? "bg-white text-[#111827]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  type="button"
                  key={speed}
                  onClick={() => props.onUpdateZoom(selected.id, { speed })}
                >
                  {speed}
                </button>
              ))}
            </div>
          </div>

          <ZoomCurveEditor
            effect={selected}
            onChange={(updates) => props.onUpdateZoom(selected.id, updates)}
            onPreviewProgress={(progress) => props.onPreviewCurve(selected, progress)}
          />

          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-black transition hover:bg-slate-200"
            type="button"
            onClick={() => props.onRemoveZoom(selected.id)}
          >
            <Trash2 size={16} />
            Delete selected zoom
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          Add a zoom, then drag its box on the timeline.
        </div>
      )}
    </div>
  );
}
