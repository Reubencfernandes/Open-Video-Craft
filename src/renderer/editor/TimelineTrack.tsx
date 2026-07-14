/**
 * One timeline row: label column + clip lane (the `track-lane` class is used
 * to map pointer X to time).
 */
import { Eye } from "lucide-react";
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
  icon: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div
      data-timeline-track={props.label}
      className={cx(
        "grid grid-cols-[var(--timeline-label-width)_minmax(0,1fr)] items-stretch gap-[var(--timeline-track-gap)]",
        Boolean(props.controls) && "gap-y-2"
      )}
    >
      <div className="inline-flex min-h-[2.5rem] min-w-0 items-center gap-2 rounded-md bg-[#161618] px-2 text-[0.7rem] font-medium text-neutral-300">
        <span className="grid size-5 flex-none place-items-center text-neutral-400" aria-hidden="true">
          {props.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        <span className="inline-flex flex-none items-center pr-0.5 text-neutral-500" aria-hidden="true">
          <Eye size={13} />
        </span>
      </div>
      <div className="track-lane relative min-h-[2.5rem] overflow-hidden rounded-md bg-white/[0.02]">
        {props.children}
      </div>
      {props.controls ? <div className="col-start-2 min-w-0">{props.controls}</div> : null}
    </div>
  );
}
