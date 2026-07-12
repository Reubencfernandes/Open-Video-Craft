/**
 * One timeline row: label column + clip lane (the `track-lane` class is used
 * to map pointer X to time).
 */
import { Eye, LockKeyhole } from "lucide-react";
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
  accent: "warm" | "lime" | "green" | "amber" | "purple" | "rose";
  icon: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const accentClassName = {
    warm: "text-amber-300",
    lime: "text-lime-400",
    green: "text-emerald-400",
    amber: "text-amber-500",
    purple: "text-purple-400",
    rose: "text-rose-400"
  }[props.accent];

  return (
    <div
      className={cx(
        "grid grid-cols-[var(--timeline-label-width)_minmax(0,1fr)] items-stretch gap-[var(--timeline-track-gap)]",
        Boolean(props.controls) && "gap-y-2"
      )}
    >
      <div className="inline-flex min-h-[2.6rem] min-w-0 items-center gap-2 rounded-lg border border-white/[0.06] bg-[#18181d] px-2 text-[0.72rem] font-bold text-slate-200">
        <span
          className={cx(
            "grid size-6 flex-none place-items-center rounded-md bg-white/[0.07]",
            accentClassName
          )}
        >
          {props.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        <span className="inline-flex flex-none items-center gap-1.5 pr-0.5 text-slate-500" aria-hidden="true">
          <LockKeyhole size={12} />
          <Eye size={12} />
        </span>
      </div>
      <div className="track-lane relative min-h-[2.6rem] overflow-hidden rounded-lg border border-white/[0.04] bg-[#101013] shadow-[inset_0_1px_3px_rgb(0_0_0_/_0.35)]">
        {props.children}
      </div>
      {props.controls ? <div className="col-start-2 min-w-0">{props.controls}</div> : null}
    </div>
  );
}
