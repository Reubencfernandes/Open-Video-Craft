import { CircleStop, Play, Scissors, SkipBack, SkipForward, SlidersHorizontal, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { createTimelineTicks, formatTimecode } from "./utils";

const transportButtonClassName =
  "grid size-7 cursor-pointer place-items-center rounded border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white";

/**
 * Transport controls (frame step / play), the frame scrubber and the frame
 * counter. The scrubber is a native range input styled flat via Tailwind
 * arbitrary variants; its fill follows the --scrubber-progress CSS variable.
 */
export function TimelineToolbar(props: {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  currentTime: number;
  playheadPercent: number;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
}) {
  return (
    <div className="grid grid-cols-[238px_minmax(0,1fr)_142px] items-center gap-3">
      <div className="inline-flex h-9 min-w-0 items-center gap-1.5 px-1.5">
        <button
          className={transportButtonClassName}
          type="button"
          onClick={() => props.onSeekFrame(props.currentFrame - 1)}
          title="Previous frame"
        >
          <SkipBack size={14} />
        </button>
        <button
          className={transportButtonClassName}
          type="button"
          onClick={props.onTogglePlayback}
          title={props.playing ? "Stop" : "Play"}
        >
          {props.playing ? <CircleStop size={15} /> : <Play size={15} />}
        </button>
        <button
          className={transportButtonClassName}
          type="button"
          onClick={() => props.onSeekFrame(props.currentFrame + 1)}
          title="Next frame"
        >
          <SkipForward size={14} />
        </button>
        <span className="text-xs font-bold tabular-nums text-slate-200">
          {formatTimecode(props.currentTime, props.currentFrame)}
        </span>
      </div>

      <input
        className="h-9 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-[2px] [&::-webkit-slider-runnable-track]:bg-[linear-gradient(90deg,#e8493a_0_var(--scrubber-progress,0%),rgb(255_255_255_/_0.14)_var(--scrubber-progress,0%)_100%)] [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[7px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/60 [&::-webkit-slider-thumb]:bg-[#e8493a]"
        type="range"
        min={0}
        max={props.totalFrames}
        step={1}
        value={props.currentFrame}
        aria-label="Timeline scrubber"
        style={{ "--scrubber-progress": `${props.playheadPercent}%` } as CSSProperties}
        onChange={(event) => props.onSeekFrame(Number(event.target.value))}
      />

      <div className="inline-flex h-9 min-w-0 items-center justify-end gap-1.5 text-[0.72rem] tabular-nums text-slate-400">
        <SlidersHorizontal size={14} />
        <span>
          {props.currentFrame} / {props.totalFrames}
        </span>
      </div>
    </div>
  );
}

/**
 * The time ruler above the tracks. Each of the six segments carries a major
 * tick (::before) plus minor ticks drawn with a repeating gradient along its
 * bottom edge, giving the classic NLE ruler strip.
 */
export function TimelineRuler(props: { duration: number }) {
  return (
    <div className="grid h-6 grid-cols-6 items-end border-b border-white/10 pl-[calc(var(--timeline-label-width)+var(--timeline-track-gap))] text-[0.66rem] tabular-nums text-slate-500">
      {createTimelineTicks(props.duration).map((tick) => (
        <span
          key={tick}
          className="relative pb-1.5 before:absolute before:bottom-0 before:left-0 before:h-2 before:w-px before:bg-white/25 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-[repeating-linear-gradient(90deg,rgb(255_255_255_/_0.1)_0_1px,transparent_1px_10%)]"
        >
          {tick}
        </span>
      ))}
    </div>
  );
}

/**
 * The red playhead line. The outer div is a widened invisible hit/positioning
 * area centered on the current time; the line is drawn with ::before and the
 * triangular head sits at the top, Premiere/Resolve style.
 */
export function TimelinePlayhead(props: { playheadPercent: number }) {
  return (
    <div
      className="playhead absolute bottom-1 top-0 z-[5] w-5 -translate-x-1/2 cursor-ew-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-[#e8493a] before:content-['']"
      aria-hidden="true"
      style={{
        left: `calc(var(--timeline-body-pad) + var(--timeline-label-width) + var(--timeline-track-gap) + (${props.playheadPercent} * (100% - (2 * var(--timeline-body-pad)) - var(--timeline-label-width) - var(--timeline-track-gap)) / 100))`
      }}
    >
      <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-[#e8493a]" />
    </div>
  );
}

/** Right-click menu for the timeline: split at the clicked time or delete. */
export function TimelineContextMenuView(props: {
  x: number;
  y: number;
  canSplit: boolean;
  canDelete: boolean;
  onSplit: () => void;
  onDelete: () => void;
}) {
  const itemClassName =
    "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 text-left text-[0.74rem] font-semibold text-slate-100 hover:enabled:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div
      className="fixed z-40 min-w-32 overflow-hidden rounded-md border border-white/10 bg-[#1b1d23] p-1 shadow-[0_16px_38px_rgb(0_0_0_/_0.45)]"
      style={{ left: props.x, top: props.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className={itemClassName} disabled={!props.canSplit} onClick={props.onSplit}>
        <Scissors size={14} />
        Split
      </button>
      <button
        type="button"
        className={`${itemClassName} text-red-300`}
        disabled={!props.canDelete}
        onClick={props.onDelete}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
}
