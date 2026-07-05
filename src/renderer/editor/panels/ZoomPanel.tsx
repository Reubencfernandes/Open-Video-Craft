import { Trash2, WandSparkles } from "lucide-react";
import { ZoomTargetPanel } from "../ZoomTargetPanel";
import type { EditorMediaItem, ZoomEffect, ZoomSpeed } from "../types";

/**
 * "Zoom" tool: add a smooth zoom at the playhead, aim it with the target
 * preview, and adjust the selected zoom's speed or delete it. The zoom's time
 * range is edited by dragging its box on the timeline.
 */
export function ZoomPanel(props: {
  previewItem: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  onAddZoom: () => void;
  onUpdateZoom: (id: string, updates: Partial<ZoomEffect>) => void;
  onRemoveZoom: (id: string) => void;
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
        onScaleChange={(scale) => {
          if (selected) {
            props.onUpdateZoom(selected.id, { scale });
          }
        }}
        onRegionChange={(region) => {
          if (selected) {
            props.onUpdateZoom(selected.id, region);
          }
        }}
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
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300/25 bg-red-500/15 px-3 text-sm font-extrabold text-red-100 hover:bg-red-500/25"
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
