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
    <div className="tool-stack">
      <div className="cut-hint">
        <Scissors size={14} />
        <span>
          Click the timeline to move the playhead, then split. Drag a clip to move it, drag its
          edges to trim, or delete the selected clip.
        </span>
      </div>
      <button className="secondary-tool-button" type="button" onClick={props.onSplitAtPlayhead}>
        <Scissors size={16} />
        Split at playhead
      </button>
      {props.selectedClip ? (
        <>
          <div className="cut-selected">
            <strong>{props.selectedClip.item.name}</strong>
            <span>
              {formatSeconds(props.selectedClip.start)} –{" "}
              {formatSeconds(props.selectedClip.start + props.selectedClip.duration)}
            </span>
          </div>
          <button
            className="secondary-tool-button secondary-tool-danger"
            type="button"
            onClick={props.onDeleteSelected}
          >
            <Trash2 size={16} />
            Delete selected clip
          </button>
        </>
      ) : (
        <div className="tool-empty">Select a clip on the timeline to trim or delete it.</div>
      )}
    </div>
  );
}
