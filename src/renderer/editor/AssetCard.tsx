/**
 * Asset grid card with drag support, a decoded video thumbnail, and a
 * duration badge.
 */
import { AudioLines, Film, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { cx } from "../classNames";
import { useMediaThumbnail } from "./thumbnail-cache";
import type { EditorMediaItem } from "./types";

/** Compact "0:11" badge format used on media tiles. */
function formatTileDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

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
        className={`grid min-w-0 gap-1 border-0 bg-transparent p-0 text-left text-inherit ${
          props.draggable ? "cursor-move active:cursor-grabbing" : "cursor-pointer"
        }`}
        type="button"
        draggable={props.draggable}
        onClick={props.onSelect}
        onDragStart={props.onDragStart}
      >
        <div
          className={cx(
            "relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border bg-[#0d0d0f] text-neutral-500 [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
            props.selected ? "border-white shadow-[0_0_0_1px_rgb(255_255_255_/_0.9)]" : "border-white/[0.07]"
          )}
        >
          {props.item.kind === "video" ? (
            <VideoThumbnail url={props.item.url} onDuration={props.onDuration} />
          ) : props.item.kind === "image" ? (
            <img src={props.item.url} alt="" />
          ) : (
            <AudioLines size={18} />
          )}
          {props.item.duration !== null && props.item.kind !== "image" ? (
            <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[0.62rem] font-semibold tabular-nums text-white">
              {formatTileDuration(props.item.duration)}
            </span>
          ) : null}
        </div>
        <strong className="truncate text-[0.7rem] font-semibold text-neutral-100">
          {props.item.name}
        </strong>
        <span className="truncate text-[0.62rem] capitalize text-neutral-500">
          {props.item.origin === "project" ? "Recording" : props.item.kind}
        </span>
      </button>
      {props.onRemove ? (
        <button
          className="absolute right-1.5 top-1.5 grid size-[1.65rem] cursor-pointer place-items-center rounded-lg border border-white/[0.14] bg-black/80 text-neutral-300 opacity-0 transition hover:bg-red-950/90 hover:text-white group-hover:opacity-100"
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
