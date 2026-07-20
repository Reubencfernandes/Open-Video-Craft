/**
 * Media tool: import actions, kind filter tabs, search, and the draggable
 * asset grid with a tile-size footer.
 */
import { useMemo, useState, type DragEvent } from "react";
import { Plus, Search, Upload, X } from "lucide-react";
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
 * "Media" tool: import actions, kind filter tabs and the asset grid. Assets
 * are dragged from here onto the timeline (imports never auto-append).
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tileSize, setTileSize] = useState(104);

  const shownMedia = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!searchOpen || !query) return props.visibleMedia;
    return props.visibleMedia.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [props.visibleMedia, searchOpen, searchQuery]);

  // Only treat drops that carry OS files as imports; internal asset drags use a
  // custom data type and must not be intercepted here.
  const isFileDrag = (event: DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden transition ${
        dropActive ? "rounded-lg ring-1 ring-inset ring-white/40" : ""
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
      <div className="flex flex-none items-center justify-end gap-1 px-0.5">
        <button
          className="grid size-8 place-items-center rounded-lg text-neutral-300 transition hover:bg-white/[0.08] hover:text-white"
          type="button"
          title="Import media"
          onClick={props.onImport}
        >
          <Upload size={15} />
        </button>
      </div>

      <div className="flex flex-none items-center gap-1 overflow-x-auto px-0.5">
        {mediaTabs.map((tab) => (
          <button
            className={`editor-choice-button flex-none whitespace-nowrap rounded-full px-2.5 py-1.5 text-[0.7rem] font-semibold ${
              props.activeTab === tab.id
                ? "bg-white/[0.14] text-white"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            }`}
            type="button"
            key={tab.id}
            aria-pressed={props.activeTab === tab.id}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button
          className={`editor-choice-button ml-auto grid size-7 flex-none place-items-center rounded-full ${
            searchOpen
              ? "bg-white/[0.14] text-white"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
          }`}
          type="button"
          title="Search media"
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open);
            setSearchQuery("");
          }}
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
      </div>

      {searchOpen ? (
        <input
          className="h-8 flex-none rounded-lg bg-white/[0.07] px-3 text-xs text-white outline-none placeholder:text-neutral-500"
          value={searchQuery}
          placeholder="Search media…"
          autoFocus
          spellCheck={false}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}
        >
          {shownMedia.map((item) => (
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

        {shownMedia.length === 0 ? (
          <div className="grid min-h-24 place-items-center gap-2 rounded-lg border border-dashed border-white/10 p-3 text-center text-xs font-semibold leading-5 text-neutral-500">
            <Plus size={18} />
            <span>
              {props.visibleMedia.length === 0
                ? "Import, drag & drop media, or finish a recording to begin editing."
                : "No media matches your search."}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-none items-center justify-between gap-3 border-t border-white/[0.06] px-0.5 pt-2 text-[0.7rem] font-medium text-neutral-400">
        <span className="truncate">Total {props.visibleMedia.length}</span>
        <input
          className="h-1 w-24 flex-none cursor-pointer accent-white"
          type="range"
          min={80}
          max={160}
          step={4}
          value={tileSize}
          title="Thumbnail size"
          aria-label="Thumbnail size"
          onChange={(event) => setTileSize(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
