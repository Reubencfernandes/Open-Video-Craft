/**
 * Asset grid card with drag support and a decoded video thumbnail.
 */
import { AudioLines, Film, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { cx } from "../classNames";
import { captureVideoThumbnail } from "./media-utils";
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
    <div className="group relative grid min-w-0 gap-1.5 text-left text-white">
      <button
        className="grid min-w-0 cursor-pointer gap-1.5 border-0 bg-transparent p-0 text-left text-inherit"
        type="button"
        draggable={props.draggable}
        onClick={props.onSelect}
        onDragStart={props.onDragStart}
      >
        <div
          className={cx(
            "grid aspect-[1.32] w-full place-items-center overflow-hidden rounded-lg border border-white/[0.08] bg-[#17181c] text-slate-400 [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
            props.selected && "border-purple-400/85 shadow-[0_0_0_3px_rgb(168_85_247_/_0.18)]"
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
        <strong className="truncate text-[0.72rem]">{props.item.name}</strong>
        <span className="truncate text-[0.64rem] text-slate-500">
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

// Captures a real decoded frame into a small JPEG so the asset grid shows an
// actual thumbnail. Handles chunked recordings that report Infinity duration
// and reports the resolved duration back to the media library.
function VideoThumbnail(props: {
  url: string;
  onDuration?: (duration: number | null) => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const onDurationRef = useRef(props.onDuration);

  useEffect(() => {
    onDurationRef.current = props.onDuration;
  }, [props.onDuration]);

  useEffect(() => {
    let cancelled = false;
    setThumbnailUrl(null);

    void captureVideoThumbnail(props.url, (duration) => {
      if (!cancelled) {
        onDurationRef.current?.(duration);
      }
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setThumbnailUrl(dataUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [props.url]);

  return thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <Film size={18} />;
}
