/**
 * Timeline chrome: editing toolbar, time ruler, playhead, and the right-click
 * context menu.
 */
import {
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2
} from "lucide-react";
import { createTimelineTicks, formatSeconds, formatTimecode } from "./utils";

const toolbarButtonClassName =
  "grid size-7 cursor-pointer place-items-center rounded border-0 bg-transparent text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

/**
 * The timeline's editing toolbar: current / total timecode on the left,
 * undo / redo / split / delete in the middle, and the horizontal time-axis
 * zoom cluster on the right. Playback transport lives in the preview panel.
 */
export function TimelineToolbar(props: {
  currentFrame: number;
  totalFrames: number;
  currentTime: number;
  renderDuration: number;
  timelineZoom: number;
  canSplit: boolean;
  canDelete: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  return (
    <div className="timeline-toolbar grid grid-cols-[minmax(180px,auto)_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.07] pb-1">
      <div className="inline-flex h-8 min-w-0 items-center gap-1.5 px-1.5 text-[0.7rem] font-semibold tabular-nums">
        <span className="text-white">
          {formatTimecode(props.currentTime, props.currentFrame)}
        </span>
        <span className="text-slate-500">
          / {formatTimecode(props.renderDuration, props.totalFrames)}
        </span>
      </div>

      <div className="inline-flex h-8 items-center gap-0.5">
        <button className={toolbarButtonClassName} type="button" title="Undo timeline clip edit (Ctrl+Z)" onClick={props.onUndo}>
          <Undo2 size={15} />
        </button>
        <button className={toolbarButtonClassName} type="button" title="Redo timeline clip edit (Ctrl+Shift+Z)" onClick={props.onRedo}>
          <Redo2 size={15} />
        </button>
        <span className="mx-1 h-4 w-px bg-white/[0.08]" aria-hidden="true" />
        <button
          className={toolbarButtonClassName}
          type="button"
          title="Delete selected clip"
          disabled={!props.canDelete}
          onClick={props.onDelete}
        >
          <Trash2 size={15} />
        </button>
        <button
          className={toolbarButtonClassName}
          type="button"
          title="Split at playhead"
          disabled={!props.canSplit}
          onClick={props.onSplit}
        >
          <Scissors size={15} />
        </button>
      </div>

      <div className="inline-flex h-8 items-center gap-0.5 text-slate-300">
        <button
          className={toolbarButtonClassName}
          type="button"
          title="Zoom out timeline"
          onClick={props.onZoomOut}
          disabled={props.timelineZoom <= 1.0001}
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[2.9rem] text-center text-[0.66rem] font-bold tabular-nums">
          {Math.round(props.timelineZoom * 100)}%
        </span>
        <button className={toolbarButtonClassName} type="button" title="Zoom in timeline" onClick={props.onZoomIn}>
          <Plus size={14} />
        </button>
        <button
          className={toolbarButtonClassName}
          type="button"
          title="Fit timeline"
          onClick={props.onZoomReset}
          disabled={props.timelineZoom <= 1.0001}
        >
          <Maximize2 size={13} />
        </button>
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
    <div className="grid h-5 grid-cols-6 items-end border-b border-white/10 pl-[calc(var(--timeline-label-width)+var(--timeline-track-gap))] text-[0.58rem] tabular-nums text-slate-500">
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
 * The playhead: a purple line topped with a rounded timecode pill, CapCut
 * style. The outer div is a widened invisible hit/positioning area centered
 * on the current time; the line is drawn with ::before.
 */
export function TimelinePlayhead(props: {
  playheadPercent: number;
  currentTime: number;
  color: string;
}) {
  return (
    <div
      className="absolute bottom-1 top-0 z-[5] w-5 -translate-x-1/2 cursor-ew-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-[2px] before:-translate-x-1/2 before:rounded-full before:bg-[var(--playhead-color)] before:content-['']"
      aria-hidden="true"
      style={{
        "--playhead-color": props.color,
        left: `calc(var(--timeline-body-pad) + var(--timeline-label-width) + var(--timeline-track-gap) + (${props.playheadPercent} * (100% - (2 * var(--timeline-body-pad)) - var(--timeline-label-width) - var(--timeline-track-gap)) / 100))`
      } as React.CSSProperties}
    >
      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border bg-[#17131f] px-2 py-0.5 text-[0.64rem] font-bold tabular-nums shadow-[0_4px_14px_rgb(0_0_0_/_0.5)]" style={{ borderColor: props.color, color: props.color }}>
        {formatSeconds(props.currentTime)}
      </span>
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
