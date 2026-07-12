/**
 * Setup tool: import button, kind filter tabs, and the draggable asset grid.
 */
import { useState, type DragEvent } from "react";
import { Plus, Upload } from "lucide-react";
import { AssetCard } from "../AssetCard";
import { mediaDragType } from "../types";
import type { EditorMediaItem, MediaPanel as MediaPanelTab } from "../types";

const mediaTabs: Array<{ id: MediaPanelTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Sound" }
];

/** Resolve the absolute paths of files dropped from the OS onto the panel. */
function pathsFromDrop(dataTransfer: DataTransfer): string[] {
  return Array.from(dataTransfer.files)
    .map((file) => window.openVideoCraft.editor.getPathForFile(file))
    .filter((path): path is string => Boolean(path));
}

/**
 * "Setup" tool: import button, kind filter tabs and the asset grid. Assets are
 * dragged from here onto the timeline (imports never auto-append).
 */
export function MediaPanel(props: {
  activeTab: MediaPanelTab;
  visibleMedia: EditorMediaItem[];
  selectedItemId: string | null;
  onImport: () => void;
  onImportPaths: (filePaths: string[]) => void;
  onTabChange: (tab: MediaPanelTab) => void;
  onSelectItem: (itemId: string) => void;
  onItemDuration: (itemId: string, duration: number | null) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  const [dropActive, setDropActive] = useState(false);

  // Only treat drops that carry OS files as imports; internal asset drags use a
  // custom data type and must not be intercepted here.
  const isFileDrag = (event: DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-xl transition ${
        dropActive ? "ring-2 ring-inset ring-purple-400/70" : ""
      }`}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        setDropActive(false);
        const paths = pathsFromDrop(event.dataTransfer);
        if (paths.length > 0) {
          props.onImportPaths(paths);
        }
      }}
    >
      <button
        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-white transition hover:border-white/[0.14] hover:bg-white/[0.08]"
        type="button"
        onClick={props.onImport}
      >
        <Upload size={17} className="text-slate-200" />
        Import Media
      </button>
      <div className="flex gap-1.5">
        {mediaTabs.map((tab) => (
          <button
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-semibold transition ${
              props.activeTab === tab.id
                ? "bg-purple-500/15 text-white"
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
          <span>Import, drag &amp; drop media, or finish a recording to begin editing.</span>
        </div>
      ) : null}
    </div>
  );
}
