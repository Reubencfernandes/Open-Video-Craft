/**
 * Clip components for every lane (media, zoom, speed, subtitle) and the
 * wavesurfer-based audio waveform.
 */
import { Captions, Film, ZoomIn } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { memo, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cx } from "../classNames";
import { loadWaveSurferBlob } from "./media-utils";
import { useMediaThumbnail } from "./thumbnail-cache";
import { SpeedIcon } from "./SpeedIcon";
import { createTimelineClipStyle } from "./timeline-utils";
import type {
  SpeedEffect,
  SubtitleSegment,
  TimelineMediaClip,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

/**
 * Flat, NLE-style clip colors (solid fills, no gradients). Every clip shares
 * the same base shape; only the fill differs by media kind.
 */
const clipBaseClassName =
  "group absolute top-[0.22rem] z-[1] inline-flex h-[1.95rem] min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-[3px] border border-black/40 px-2 text-left text-[0.68rem] font-semibold text-white transition-[left,width] duration-200 ease-out hover:brightness-110";

/** Inset outline so selection is visible inside lanes with overflow:hidden. */
const clipSelectedClassName = "outline outline-1 -outline-offset-1 outline-white/90";

/** Invisible widened hit areas on both clip edges used to start a trim drag. */
function ClipTrimEdges(props: {
  onTrimPointerDown: (event: ReactPointerEvent<HTMLElement>, edge: TimelineTrimEdge) => void;
}) {
  return (
    <>
      <span
        className="absolute inset-y-0 left-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:left-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, "start")}
      />
      <span
        className="absolute inset-y-0 right-0 z-[4] w-2 cursor-ew-resize after:absolute after:bottom-1.5 after:right-1 after:top-1.5 after:w-0.5 after:rounded-full after:bg-white/70 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, "end")}
      />
    </>
  );
}

/**
 * A media clip on the video or audio track. Video/image clips show an icon and
 * the source file name; audio clips render their waveform with the name on top.
 * Dragging the clip body moves it; dragging either edge trims it.
 */
export function TimelineClip(props: {
  clip: TimelineMediaClip;
  timelineDuration: number;
  selected: boolean;
  onSelect: () => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
  onMovePointerDown: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
}) {
  const item = props.clip.item;
  const { thumbnailUrl } = useMediaThumbnail(item);
  const fillClassName =
    item.kind === "audio"
      ? "bg-[#2b7a5b]"
      : item.kind === "image"
        ? "bg-[#2f7d6d]"
        : "bg-[#3f6db4]";

  return (
    <button
      className={cx(clipBaseClassName, fillClassName, props.selected && clipSelectedClassName)}
      type="button"
      data-segment-id={props.clip.id}
      style={createTimelineClipStyle(props.clip.start, props.clip.duration, props.timelineDuration)}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onMovePointerDown(event, props.clip.id)}
    >
      {item.kind !== "audio" && thumbnailUrl ? (
        <>
          {/* Poster frame fills the clip; a dark scrim keeps the label legible. */}
          <img
            className="pointer-events-none absolute inset-0 z-0 size-full object-cover opacity-80"
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
          />
          <span className="pointer-events-none absolute inset-0 z-0 bg-black/45" aria-hidden="true" />
        </>
      ) : null}
      {item.kind === "audio" ? (
        <AudioWaveform id={props.clip.id} name={item.name} url={item.url} />
      ) : (
        <Film className="relative z-[2] flex-none" size={13} />
      )}
      <strong className="relative z-[2] min-w-0 truncate">{item.name}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onTrimPointerDown(event, props.clip.id, edge)}
      />
    </button>
  );
}

/** A zoom effect region on the zoom track; movable and trimmable like a clip. */
export function TimelineZoomClip(props: {
  effect: ZoomEffect;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#8a6d3b]", props.selected && clipSelectedClassName)}
      type="button"
      title={`Zoom (${props.effect.speed})`}
      style={createTimelineClipStyle(
        props.effect.start,
        props.effect.end - props.effect.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.effect.id, "move")}
    >
      <ZoomIn className="relative z-[2] flex-none" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">Zoom</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.effect.id, edge)}
      />
    </button>
  );
}

/** A speed effect region on the speed track; movable and trimmable like zoom. */
export function TimelineSpeedClip(props: {
  effect: SpeedEffect;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#256f7a]", props.selected && clipSelectedClassName)}
      type="button"
      title={`Speed ${props.effect.rate}x`}
      style={createTimelineClipStyle(
        props.effect.start,
        props.effect.end - props.effect.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.effect.id, "move")}
    >
      <SpeedIcon className="relative z-[2]" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">{props.effect.rate}x</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.effect.id, edge)}
      />
    </button>
  );
}

/** A subtitle entry on the subtitles track. Drag the body to move it across the
 * timeline; drag either edge to change when it starts/ends. */
export function TimelineSubtitleClip(props: {
  subtitle: SubtitleSegment;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#20707f]", props.selected && clipSelectedClassName)}
      type="button"
      title={props.subtitle.text}
      style={createTimelineClipStyle(
        props.subtitle.start,
        props.subtitle.end - props.subtitle.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.subtitle.id, "move")}
    >
      <Captions className="relative z-[2] flex-none" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">{props.subtitle.text}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.subtitle.id, edge)}
      />
    </button>
  );
}

/**
 * Renders the audio clip's waveform with wavesurfer.js. Creation is deferred a
 * frame so the container has a real size, and the blob is fetched manually so
 * a MIME type can be inferred for formats Chromium won't sniff.
 */
export const AudioWaveform = memo(function AudioWaveform(props: {
  id: string;
  name: string;
  url: string;
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let wavesurfer: ReturnType<typeof WaveSurfer.create> | null = null;
    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (!container.isConnected) {
        return;
      }

      container.replaceChildren();
      setFailed(false);
      wavesurfer = WaveSurfer.create({
        container,
        height: 24,
        waveColor: "rgba(209, 250, 229, 0.85)",
        progressColor: "rgba(34, 211, 238, 0.95)",
        cursorWidth: 0,
        interact: false,
        normalize: true,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        hideScrollbar: true,
        autoScroll: false,
        autoCenter: false
      });

      wavesurfer.on("ready", () => setFailed(false));
      wavesurfer.on("decode", () => setFailed(false));

      void loadWaveSurferBlob(wavesurfer, props.url, props.name).catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      try {
        wavesurfer?.destroy();
      } catch {
        // ignore teardown races when the clip unmounts mid-load
      }
      container.replaceChildren();
    };
  }, [props.name, props.url]);

  return (
    <span
      className={cx(
        "pointer-events-none absolute inset-x-2 inset-y-1 z-[1] flex items-center overflow-hidden bg-transparent opacity-95 [mask-image:linear-gradient(90deg,transparent_0,#000_0.55rem,#000_calc(100%_-_0.55rem),transparent_100%)] [&>div]:w-full",
        // Simple striped placeholder when the audio cannot be decoded.
        failed &&
          "bg-[repeating-linear-gradient(90deg,transparent_0_5px,rgb(209_250_229_/_0.9)_5px_8px,transparent_8px_12px)]"
      )}
      aria-hidden="true"
      ref={containerRef}
    />
  );
});
