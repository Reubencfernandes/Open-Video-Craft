/**
 * Clip components for every lane (media, zoom, speed, subtitle) and the
 * cubic-Bézier audio waveform.
 */
import { Type, ZoomIn } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cx } from "../classNames";
import { BezierAudioWaveform } from "./BezierAudioWaveform";
import { useMediaFilmstrip } from "./thumbnail-cache";
import { VideoFilmstrip } from "./VideoFilmstrip";
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
  subtitle: "outline outline-2 -outline-offset-2 outline-rose-400"
} as const;

/** Widened hit areas on both clip edges used to start a trim drag; a white
 * pill handle fades in on hover, matching the reference design. */
function ClipTrimEdges(props: {
  onTrimPointerDown: (event: ReactPointerEvent<HTMLElement>, edge: TimelineTrimEdge) => void;
}) {
  return (
    <>
      <span
        className="absolute inset-y-0 left-0 z-[4] w-2.5 cursor-ew-resize after:absolute after:bottom-2 after:left-1 after:top-2 after:w-[3px] after:rounded-full after:bg-white/85 after:opacity-0 after:transition group-hover:after:opacity-100"
        onPointerDown={(event) => props.onTrimPointerDown(event, "start")}
      />
      <span
        className="absolute inset-y-0 right-0 z-[4] w-2.5 cursor-ew-resize after:absolute after:bottom-2 after:right-1 after:top-2 after:w-[3px] after:rounded-full after:bg-white/85 after:opacity-0 after:transition group-hover:after:opacity-100"
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
  audioLevel?: { volume: number; muted: boolean };
  onSelect: () => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
  onMovePointerDown: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
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
