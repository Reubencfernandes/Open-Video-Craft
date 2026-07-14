/**
 * Clip components for every lane (media, zoom, speed, subtitle) and the
 * cubic-Bézier audio waveform.
 */
import { Blend, Pilcrow, Type, ZoomIn } from "lucide-react";
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
      className="absolute top-[0.3rem] z-[3] grid h-[1.4rem] min-w-5 place-items-center overflow-hidden rounded border border-cyan-200/60 bg-cyan-500/75 text-white shadow-lg hover:bg-cyan-400"
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
  "group absolute top-[0.15rem] z-[1] inline-flex h-[1.7rem] min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm border border-black/40 px-2 text-left text-[0.64rem] font-semibold text-white transition-[left,width] duration-200 ease-out hover:brightness-110";

/** Inset outlines match their lane instead of using one unrelated selection color. */
const selectedOutlineClassName = {
  video: "outline outline-2 -outline-offset-2 outline-amber-400",
  audio: "outline outline-2 -outline-offset-2 outline-emerald-400",
  zoom: "outline outline-2 -outline-offset-2 outline-purple-400",
  speed: "outline outline-2 -outline-offset-2 outline-lime-400",
  subtitle: "outline outline-2 -outline-offset-2 outline-rose-400",
  text: "outline outline-2 -outline-offset-2 outline-sky-400"
} as const;

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
  audioLevel?: { volume: number; muted: boolean };
  onSelect: () => void;
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
      ? "bg-[#17543a]"
      : item.kind === "image"
        ? "bg-[#6b4522]"
        : "bg-[#242527]";

  return (
    <button
      className={cx(
        clipBaseClassName,
        fillClassName,
        props.selected && selectedOutlineClassName[item.kind === "audio" ? "audio" : "video"]
      )}
      type="button"
      data-segment-id={props.clip.id}
      style={createTimelineClipStyle(props.clip.start, props.clip.duration, props.timelineDuration)}
      onClick={props.onSelect}
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
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#5b3287]", props.selected && selectedOutlineClassName.zoom)}
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
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#3f6212]", props.selected && selectedOutlineClassName.speed)}
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
  onSelect: () => void;
  onDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#7f2945]", props.selected && selectedOutlineClassName.subtitle)}
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
      <Type className="relative z-[2] flex-none" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">{props.subtitle.text}</strong>
      <ClipTrimEdges
        onTrimPointerDown={(event, edge) => props.onDragPointerDown(event, props.subtitle.id, edge)}
      />
    </button>
  );
}

/** A freeform text layer on the shared timeline. */
export function TimelineTextClip(props: {
  overlay: TextOverlay;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cx(clipBaseClassName, "bg-[#075985]", props.selected && selectedOutlineClassName.text)}
      type="button"
      data-text-overlay-clip-id={props.overlay.id}
      title={props.overlay.text}
      style={createTimelineClipStyle(
        props.overlay.start,
        props.overlay.end - props.overlay.start,
        props.duration
      )}
      onClick={props.onSelect}
    >
      <Pilcrow className="relative z-[2] flex-none" size={13} />
      <strong className="relative z-[2] min-w-0 truncate">{props.overlay.text || "Text"}</strong>
    </button>
  );
}
