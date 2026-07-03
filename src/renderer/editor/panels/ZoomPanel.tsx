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
    <div className="tool-stack">
      <button className="secondary-tool-button" type="button" onClick={props.onAddZoom}>
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
          <div className="layout-control-group">
            <span>Zoom speed</span>
            <div className="segmented-control segmented-control-3">
              {(["slow", "medium", "fast"] as ZoomSpeed[]).map((speed) => (
                <button
                  className={selected.speed === speed ? "segmented-active" : ""}
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
            className="secondary-tool-button secondary-tool-danger"
            type="button"
            onClick={() => props.onRemoveZoom(selected.id)}
          >
            <Trash2 size={16} />
            Delete selected zoom
          </button>
        </>
      ) : (
        <div className="tool-empty">Add a zoom, then drag its box on the timeline.</div>
      )}
    </div>
  );
}
