/**
 * Asset grid card with drag support and a decoded video thumbnail.
 */
import { AudioLines, Film, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { cx } from "../classNames";
import { useMediaThumbnail } from "./thumbnail-cache";
import type { EditorMediaItem } from "./types";

export function AssetCard(props: {
  item: EditorMediaItem;
  selected: boolean;
  draggable?: boolean;
  onSelect: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDuration?: (duration: number | null) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative grid min-w-0 gap-1 text-left text-white">
      <button
        className="grid min-w-0 cursor-pointer gap-1 border-0 bg-transparent p-0 text-left text-inherit"
        type="button"
        draggable={props.draggable}
        onClick={props.onSelect}
        onDragStart={props.onDragStart}
      >
        <div
          className={cx(
            "grid aspect-video w-full place-items-center overflow-hidden rounded-sm border border-white/[0.08] bg-[#11141a] text-slate-400 [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
            props.selected && "border-[#c9ad73] shadow-[0_0_0_1px_rgb(201_173_115_/_0.35)]"
          )}
        >
          {props.item.kind === "video" ? (
            <VideoThumbnail url={props.item.url} onDuration={props.onDuration} />
          ) : props.item.kind === "image" ? (
            <img src={props.item.url} alt="" />
          ) : (
            <AudioLines size={18} />
          )}
        </div>
        <strong className="truncate text-[0.68rem] font-semibold">{props.item.name}</strong>
        <span className="truncate text-[0.6rem] text-slate-500">
          {props.item.origin === "project" ? "Recording" : props.item.kind}
        </span>
      </button>
      {props.onRemove ? (
        <button
          className="absolute right-1.5 top-1.5 grid size-[1.65rem] cursor-pointer place-items-center rounded-[7px] border border-white/[0.14] bg-slate-950/80 text-red-400 hover:bg-red-950/90 hover:text-white"
          type="button"
          onClick={props.onRemove}
          title="Remove imported media"
        >
          <Trash2 size={13} />
        </button>
      ) : null}
    </div>
  );
}

// Shows a decoded poster frame for the asset grid (via the shared thumbnail
// cache, so it matches the timeline) and reports the resolved duration back to
// the media library.
function VideoThumbnail(props: {
  url: string;
  onDuration?: (duration: number | null) => void;
}) {
  const { thumbnailUrl, duration } = useMediaThumbnail({ url: props.url, kind: "video" });
  const onDurationRef = useRef(props.onDuration);

  useEffect(() => {
    onDurationRef.current = props.onDuration;
  }, [props.onDuration]);

  useEffect(() => {
    if (duration !== null) {
      onDurationRef.current?.(duration);
    }
  }, [duration]);

  return thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <Film size={18} />;
}
