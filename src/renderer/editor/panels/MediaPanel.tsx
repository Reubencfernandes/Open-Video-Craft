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
    <>
      <button className="import-button" type="button" onClick={props.onImport}>
        <Upload size={15} />
        Import media
      </button>
      <div className="media-tabs">
        {(["all", "video", "audio", "image"] as MediaPanelTab[]).map((tab) => (
          <button
            className={props.activeTab === tab ? "media-tab-active" : ""}
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
        <div className="media-empty">
          <Plus size={18} />
          <span>Import media or finish a recording to begin editing.</span>
        </div>
      ) : null}
    </>
  );
}
