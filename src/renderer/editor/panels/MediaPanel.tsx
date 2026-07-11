/**
 * Setup tool: import button, kind filter tabs, and the draggable asset grid.
 */
import { FolderArchive, Plus, Upload } from "lucide-react";
import { AssetCard } from "../AssetCard";
import { mediaDragType } from "../types";
import type { EditorMediaItem, MediaPanel as MediaPanelTab } from "../types";

const mediaTabs: Array<{ id: MediaPanelTab; label: string }> = [
  { id: "all", label: "All Media" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Sound" }
];

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
        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-white transition hover:border-white/[0.14] hover:bg-white/[0.08]"
        type="button"
        onClick={props.onImport}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-white/[0.07] text-slate-200">
          <FolderArchive size={15} />
        </span>
        <span className="grid size-8 place-items-center rounded-lg bg-white/[0.07] text-slate-200">
          <Upload size={15} />
        </span>
        Import Media
      </button>
      <div className="flex gap-1.5">
        {mediaTabs.map((tab) => (
          <button
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-semibold transition ${
              props.activeTab === tab.id
                ? "bg-violet-500/[0.08] text-white shadow-[inset_0_-2px_#d946ef]"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
            }`}
            type="button"
            key={tab.id}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
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
