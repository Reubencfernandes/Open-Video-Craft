/**
 * Timeline chrome: bottom editing toolbar, time ruler, playhead, and the
 * right-click context menu.
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
import type { PointerEvent as ReactPointerEvent } from "react";
import { createTimelineTicks, formatSeconds } from "./utils";

const toolbarButtonClassName =
  "grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

/**
 * The timeline's bottom toolbar: undo / redo / split / delete on the left and
 * the horizontal time-axis zoom cluster on the right. The timecode readout
 * and playback transport live in the preview panel.
 */
export function TimelineToolbar(props: {
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
    <div className="timeline-toolbar flex min-h-11 flex-none items-center justify-between gap-2 border-t border-white/[0.05]">
      <div className="inline-flex items-center gap-0.5">
        <button className={toolbarButtonClassName} type="button" title="Undo timeline clip edit (Ctrl+Z)" onClick={props.onUndo}>
          <Undo2 size={16} />
        </button>
        <button className={toolbarButtonClassName} type="button" title="Redo timeline clip edit (Ctrl+Shift+Z)" onClick={props.onRedo}>
          <Redo2 size={16} />
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
        <button
          className={toolbarButtonClassName}
          type="button"
          title="Delete selected clip"
          disabled={!props.canDelete}
          onClick={props.onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="inline-flex items-center gap-0.5 text-neutral-300">
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
    <div className="grid h-6 grid-cols-6 items-end pl-[calc(var(--timeline-label-width)+var(--timeline-track-gap))] text-[0.62rem] font-medium tabular-nums text-neutral-500">
      {createTimelineTicks(props.duration).map((tick) => (
        <span
          key={tick}
          className="relative pb-1.5 before:absolute before:bottom-0 before:left-0 before:h-1.5 before:w-px before:bg-white/25 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-[repeating-linear-gradient(90deg,rgb(255_255_255_/_0.08)_0_1px,transparent_1px_10%)]"
        >
          {tick}
        </span>
      ))}
    </div>
  );
}

/**
 * The playhead: a thin white line topped with a dark rounded timecode pill,
 * CapCut style. The outer div is a widened invisible hit/positioning area
 * centered on the current time; the line is drawn with ::before.
 */
export function TimelinePlayhead(props: {
  playheadPercent: number;
  currentTime: number;
  color: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className="absolute bottom-1 top-0 z-[5] w-5 -translate-x-1/2 cursor-ew-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-[var(--playhead-color)] before:content-['']"
      aria-hidden="true"
      data-timeline-playhead
      style={{
        "--playhead-color": props.color,
        left: `calc(var(--timeline-body-pad) + var(--timeline-label-width) + var(--timeline-track-gap) + (${props.playheadPercent} * (100% - (2 * var(--timeline-body-pad)) - var(--timeline-label-width) - var(--timeline-track-gap)) / 100))`
      } as React.CSSProperties}
      onPointerDown={(event) => { event.stopPropagation(); props.onPointerDown(event); }}
      onPointerMove={(event) => { event.stopPropagation(); props.onPointerMove(event); }}
      onPointerUp={(event) => { event.stopPropagation(); props.onPointerUp(event); }}
      onPointerCancel={(event) => { event.stopPropagation(); props.onPointerUp(event); }}
    >
      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/50 bg-[#222226] px-2 py-0.5 text-[0.64rem] font-bold tabular-nums text-white shadow-[0_4px_14px_rgb(0_0_0_/_0.5)]">
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
    "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[0.74rem] font-semibold text-neutral-100 hover:enabled:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div
      className="fixed z-40 min-w-32 overflow-hidden rounded-lg border border-white/10 bg-[#1c1c1f] p-1 shadow-[0_16px_38px_rgb(0_0_0_/_0.45)]"
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
