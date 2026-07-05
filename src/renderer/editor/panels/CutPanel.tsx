import { Scissors, Trash2 } from "lucide-react";
import { formatSeconds } from "../utils";
import type { TimelineMediaClip } from "../types";

/**
 * "Cut" tool: split the clip under the playhead and show/delete the selected
 * timeline clip. Trimming and moving happen directly on the timeline.
 */
export function CutPanel(props: {
  selectedClip: TimelineMediaClip | null;
  onSplitAtPlayhead: () => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div className="grid content-start gap-4 overflow-auto">
      <div className="flex gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm font-semibold leading-5 text-slate-300">
        <Scissors size={14} />
        <span>
          Click the timeline to move the playhead, then split. Drag a clip to move it, drag its
          edges to trim, or delete the selected clip.
        </span>
      </div>
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-extrabold text-white hover:bg-white/10"
        type="button"
        onClick={props.onSplitAtPlayhead}
      >
        <Scissors size={16} />
        Split at playhead
      </button>
      {props.selectedClip ? (
        <>
          <div className="grid gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <strong>{props.selectedClip.item.name}</strong>
            <span className="text-xs font-bold text-slate-400">
              {formatSeconds(props.selectedClip.start)} –{" "}
              {formatSeconds(props.selectedClip.start + props.selectedClip.duration)}
            </span>
          </div>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300/25 bg-red-500/15 px-3 text-sm font-extrabold text-red-100 hover:bg-red-500/25"
            type="button"
            onClick={props.onDeleteSelected}
          >
            <Trash2 size={16} />
            Delete selected clip
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          Select a clip on the timeline to trim or delete it.
        </div>
      )}
    </div>
  );
}
