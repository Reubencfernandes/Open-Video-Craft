/**
 * One timeline row: label column + clip lane (the `track-lane` class is used
 * to map pointer X to time).
 */
import type { ReactNode } from "react";
import { cx } from "../classNames";

/**
 * One horizontal row of the timeline: a fixed-width label column on the left
 * and a clip lane on the right. Clips position themselves absolutely inside
 * the lane as percentages of the rendered timeline duration.
 *
 * The `track-lane` class name is load-bearing: EditorView locates the lane via
 * `querySelector(".track-lane")` to convert pointer X positions into timeline
 * time, so it must stay on the lane element even though styling is Tailwind.
 */
export function TimelineTrack(props: {
  label: string;
  accent: "purple" | "cyan" | "green" | "amber" | "rose";
  icon: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const accentClassName = {
    purple: "text-purple-300",
    cyan: "text-cyan-400",
    green: "text-emerald-400",
    amber: "text-amber-500",
    rose: "text-rose-400"
  }[props.accent];

  return (
    <div
      className={cx(
        "grid grid-cols-[var(--timeline-label-width)_minmax(0,1fr)] items-stretch gap-[var(--timeline-track-gap)]",
        Boolean(props.controls) && "gap-y-2"
      )}
    >
      <div className="inline-flex min-h-[2.35rem] min-w-0 items-center gap-2 rounded-l-[3px] border-r border-white/[0.07] bg-white/[0.03] pl-2 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-slate-400">
        <span className={cx("flex-none", accentClassName)}>{props.icon}</span>
        <span className="truncate">{props.label}</span>
      </div>
      <div className="track-lane relative min-h-[2.35rem] overflow-hidden rounded-[3px] border border-white/[0.05] bg-[#191b1f] shadow-[inset_0_1px_3px_rgb(0_0_0_/_0.35)]">
        {props.children}
      </div>
      {props.controls ? <div className="col-start-2 min-w-0">{props.controls}</div> : null}
    </div>
  );
}
