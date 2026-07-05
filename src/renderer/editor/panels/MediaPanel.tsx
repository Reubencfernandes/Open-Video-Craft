import { Plus, Upload } from "lucide-react";
import { AssetCard } from "../AssetCard";
import { mediaDragType } from "../types";
import type { EditorMediaItem, MediaPanel as MediaPanelTab } from "../types";

/**
 * "Setup" tool: import button, kind filter tabs and the asset grid. Assets are
 * dragged from here onto the timeline (imports never auto-append).
 */
export function MediaPanel(props: {
  activeTab: MediaPanelTab;
  visibleMedia: EditorMediaItem[];
  selectedItemId: string | null;
  onImport: () => void;
  onTabChange: (tab: MediaPanelTab) => void;
  onSelectItem: (itemId: string) => void;
  onItemDuration: (itemId: string, duration: number | null) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.06] text-sm font-extrabold text-white hover:bg-white/10"
        type="button"
        onClick={props.onImport}
      >
        <Upload size={15} />
        Import media
      </button>
      <div className="flex gap-2">
        {(["all", "video", "audio", "image"] as MediaPanelTab[]).map((tab) => (
          <button
            className={`min-w-0 flex-1 rounded-full px-3 py-2 text-sm font-bold ${
              props.activeTab === tab
                ? "bg-white/[0.08] text-white"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
            }`}
            type="button"
            key={tab}
            onClick={() => props.onTabChange(tab)}
          >
            {tab === "all" ? "All" : tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {props.visibleMedia.map((item) => (
          <AssetCard
            key={item.id}
            item={item}
            selected={props.selectedItemId === item.id}
            draggable={item.track !== "camera"}
            onSelect={() => props.onSelectItem(item.id)}
            onDragStart={(event) => {
              event.dataTransfer.setData(mediaDragType, item.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onDuration={(nextDuration) => props.onItemDuration(item.id, nextDuration)}
            onRemove={
              item.origin === "imported" ? () => props.onRemoveItem(item.id) : undefined
            }
          />
        ))}
      </div>

      {props.visibleMedia.length === 0 ? (
        <div className="grid min-h-32 place-items-center gap-2 rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          <Plus size={18} />
          <span>Import media or finish a recording to begin editing.</span>
        </div>
      ) : null}
    </div>
  );
}
