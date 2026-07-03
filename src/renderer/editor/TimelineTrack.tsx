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
      <div
        className={cx(
          "inline-flex min-h-[2.35rem] min-w-0 items-center gap-2 border-r border-white/[0.07] pl-1 text-[0.68rem] font-bold",
          accentClassName
        )}
      >
        {props.icon}
        <span className="truncate">{props.label}</span>
      </div>
      <div className="track-lane relative min-h-[2.35rem] overflow-hidden rounded-[3px] border border-white/[0.05] bg-[#1d2026]">
        {props.children}
      </div>
      {props.controls ? <div className="col-start-2 min-w-0">{props.controls}</div> : null}
    </div>
  );
}
