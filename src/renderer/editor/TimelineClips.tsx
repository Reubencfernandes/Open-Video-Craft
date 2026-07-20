/**
 * Clip components for every lane (media, zoom, speed, subtitle) and the
 * cubic-Bézier audio waveform.
 */
import { Blend, Captions, Music2, Type, WandSparkles, ZoomIn } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cx } from "../classNames";
import { BezierAudioWaveform } from "./BezierAudioWaveform";
import { useMediaFilmstrip } from "./thumbnail-cache";
import { VideoFilmstrip } from "./VideoFilmstrip";
import { SpeedIcon } from "./SpeedIcon";
import { createTimelineClipStyle } from "./timeline-utils";
import type {
  SpeedEffect,
  ClipTransition,
  SubtitleSegment,
  TextOverlay,
  TimelineMediaClip,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

/** Compact marker centered over the cut rendered by a clip transition. */
export function TimelineTransitionMarker(props: {
  transition: ClipTransition;
  cutTime: number;
  timelineDuration: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="absolute top-[0.45rem] z-[3] grid h-[1.6rem] min-w-6 place-items-center overflow-hidden rounded-md border border-white/25 bg-[#2563eb] text-white shadow-lg hover:bg-[#3b82f6]"
      title={`${transitionLabel(props.transition.type)} (${props.transition.duration.toFixed(1)}s)`}
      style={createTimelineClipStyle(
        Math.max(0, props.cutTime - props.transition.duration / 2),
        props.transition.duration,
        props.timelineDuration
      )}
      onClick={(event) => { event.stopPropagation(); props.onSelect(); }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Blend size={12} />
    </button>
  );
}

/** Drag-only guide rendered at every eligible cut while a transition is held. */
export function TimelineTransitionDropTarget(props: {
  cutTime: number;
  timelineDuration: number;
  active: boolean;
}) {
  const left = props.timelineDuration > 0
    ? `${Math.max(0, Math.min(100, (props.cutTime / props.timelineDuration) * 100))}%`
    : "0%";

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 z-[6] w-0.5 -translate-x-1/2 transition ${
        props.active
          ? "bg-cyan-200 shadow-[0_0_0_4px_rgb(34_211_238_/_0.2),0_0_14px_rgb(34_211_238_/_0.8)]"
          : "bg-cyan-400/35"
      }`}
      style={{ left }}
    >
      {props.active ? (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-cyan-300 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-950 shadow-lg">
          Drop transition
        </span>
      ) : null}
    </span>
  );
}

function transitionLabel(type: ClipTransition["type"]): string {
  return ({
    crossfade: "Crossfade",
    "fade-black": "Fade through black",
    "slide-left": "Slide left",
    "wipe-left": "Wipe left"
  })[type];
}

/**
 * Compact clip look: neutral/warm fills for audio/text, decoded filmstrip
 * thumbnails for video. Every clip shares the same base shape; only the fill
 * differs by lane.
 */
const clipBaseClassName =
  "group absolute top-[0.15rem] z-[1] inline-flex h-[2.2rem] min-w-0 cursor-move items-center gap-1.5 overflow-hidden rounded-md border border-black/40 px-2 text-left text-[0.68rem] font-semibold text-white transition-[left,width] duration-200 ease-out hover:brightness-110 active:cursor-grabbing";

/** Every selected clip gets the same white inset outline, like the reference. */
const selectedOutlineClassName = "outline outline-2 -outline-offset-2 outline-white";
const rangeSelectedOutlineClassName =
  "outline outline-2 -outline-offset-2 outline-pink-200 shadow-[inset_0_0_0_1px_rgb(244_114_182_/_0.55)]";

/** Timeline feedback shown while on-device subtitle generation is working. */
export function TimelineSubtitleShimmer() {
  return (
    <div
      className="timeline-subtitle-shimmer pointer-events-none absolute inset-[0.15rem] z-0 inline-flex h-[2.2rem] items-center justify-end gap-2 overflow-hidden rounded-md bg-emerald-500/10 px-3 text-right text-[0.68rem] font-semibold text-emerald-100 ring-1 ring-inset ring-emerald-300/25"
      data-subtitle-processing
      role="status"
      aria-label="Generating subtitles"
    >
      <WandSparkles className="relative z-[1] shrink-0" size={14} />
      <span className="relative z-[1] truncate">Generating subtitles…</span>
    </div>
  );
}

/** Widened hit areas on both clip edges used to start a trim drag; a white
 * pill handle fades in on hover, matching the reference design. */
function ClipTrimEdges(props: {
  onTrimPointerDown: (event: ReactPointerEvent<HTMLElement>, edge: TimelineTrimEdge) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <>
      <span
        data-trim-edge="start"
        className="absolute inset-y-0 left-0 z-[4] w-2.5 cursor-ew-resize after:absolute after:bottom-2 after:left-1 after:top-2 after:w-[3px] after:rounded-full after:bg-white/85 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, "start")}
        onPointerMove={props.onPointerMove ? (event) => { event.stopPropagation(); props.onPointerMove?.(event); } : undefined}
        onPointerUp={props.onPointerUp ? (event) => { event.stopPropagation(); props.onPointerUp?.(event); } : undefined}
        onPointerCancel={props.onPointerUp ? (event) => { event.stopPropagation(); props.onPointerUp?.(event); } : undefined}
      />
      <span
        data-trim-edge="end"
        className="absolute inset-y-0 right-0 z-[4] w-2.5 cursor-ew-resize after:absolute after:bottom-2 after:right-1 after:top-2 after:w-[3px] after:rounded-full after:bg-white/85 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, "end")}
        onPointerMove={props.onPointerMove ? (event) => { event.stopPropagation(); props.onPointerMove?.(event); } : undefined}
        onPointerUp={props.onPointerUp ? (event) => { event.stopPropagation(); props.onPointerUp?.(event); } : undefined}
        onPointerCancel={props.onPointerUp ? (event) => { event.stopPropagation(); props.onPointerUp?.(event); } : undefined}
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
  rangeSelected?: boolean;
  audioLevel?: { volume: number; muted: boolean };
  onSelect: (additive: boolean) => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
  onMovePointerDown: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
  onInteractionPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onInteractionPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const item = props.clip.item;
  const { frames } = useMediaFilmstrip(item);
  const fillClassName =
    item.kind === "audio"
      ? "bg-[#1d4ed8]"
      : item.kind === "image"
        ? "bg-[#2a2a2e]"
        : "bg-[#222226]";

  return (
    <button
      className={cx(
        clipBaseClassName,
        fillClassName,
        props.selected &&
          (props.rangeSelected ? rangeSelectedOutlineClassName : selectedOutlineClassName)
      )}
      type="button"
      data-segment-id={props.clip.id}
      style={createTimelineClipStyle(props.clip.start, props.clip.duration, props.timelineDuration)}
      onClick={(event) =>
        props.onSelect(event.metaKey || event.ctrlKey || event.shiftKey)
      }
      onPointerDown={(event) => props.onMovePointerDown(event, props.clip.id)}
    >
      {item.kind !== "audio" ? <VideoFilmstrip frames={frames} /> : null}
      {item.kind === "audio" ? (
        <BezierAudioWaveform
          id={props.clip.id}
          name={item.name}
          volume={props.audioLevel?.volume ?? 100}
          muted={props.audioLevel?.muted ?? false}
        />
      ) : null}
      {item.kind === "audio" ? (
        <Music2 className="relative z-[2] flex-none" size={13} />
      ) : null}
      <strong className="relative z-[2] min-w-0 truncate">{item.name}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onTrimPointerDown(event, props.clip.id, edge)}
        onPointerMove={props.onInteractionPointerMove}
        onPointerUp={props.onInteractionPointerUp}
      />
    </button>
  );
}

/** A zoom effect region on the zoom track; movable and trimmable like a clip. */
export function TimelineZoomClip(props: {
  effect: ZoomEffect;
  duration: number;
  selected: boolean;
  rangeSelected?: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(
        clipBaseClassName,
        "bg-[#7c3aed]",
        props.selected &&
          (props.rangeSelected ? rangeSelectedOutlineClassName : selectedOutlineClassName)
      )}
      type="button"
      data-zoom-effect-id={props.effect.id}
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
  rangeSelected?: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(
        clipBaseClassName,
        "bg-[#5b21b6]",
        props.selected &&
          (props.rangeSelected ? rangeSelectedOutlineClassName : selectedOutlineClassName)
      )}
      type="button"
      data-speed-effect-id={props.effect.id}
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
  rangeSelected?: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(
        clipBaseClassName,
        "bg-[#15803d]",
        props.selected &&
          (props.rangeSelected ? rangeSelectedOutlineClassName : selectedOutlineClassName)
      )}
      type="button"
      data-subtitle-id={props.subtitle.id}
      title={props.subtitle.text}
      style={createTimelineClipStyle(
        props.subtitle.start,
        props.subtitle.end - props.subtitle.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.subtitle.id, "move")}
    >
      <Captions className="relative z-[2] flex-none" size={14} />
      <strong className="relative z-[2] min-w-0 truncate">{props.subtitle.text}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.subtitle.id, edge)}
      />
    </button>
  );
}

/** A freeform text layer on the shared timeline. Drag the body to move it;
 * drag either edge to change when it appears/disappears. */
export function TimelineTextClip(props: {
  overlay: TextOverlay;
  duration: number;
  selected: boolean;
  rangeSelected?: boolean;
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(
        clipBaseClassName,
        "bg-[#0e7490]",
        props.selected &&
          (props.rangeSelected ? rangeSelectedOutlineClassName : selectedOutlineClassName)
      )}
      type="button"
      data-text-overlay-clip-id={props.overlay.id}
      title={props.overlay.text}
      style={createTimelineClipStyle(
        props.overlay.start,
        props.overlay.end - props.overlay.start,
        props.duration
      )}
      onClick={props.onSelect}
      onPointerDown={(event) => props.onDragPointerDown(event, props.overlay.id, "move")}
    >
      <Type className="relative z-[2] flex-none" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">{props.overlay.text || "Text"}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.overlay.id, edge)}
      />
    </button>
  );
}
