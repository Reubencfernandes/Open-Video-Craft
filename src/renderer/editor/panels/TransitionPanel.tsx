import { Blend, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RangeControl } from "../controls";
import type { ClipTransition, ClipTransitionType, TimelineMediaClip } from "../types";
import { transitionDragType } from "../types";
import {
  getMaxTransitionDuration,
  getTimelineTransitionBoundaries,
  getTransitionBoundaryKey,
  transitionOptions
} from "../transition-utils";

/** Controls the transition centered on one adjacent video-clip cut. */
export function TransitionPanel(props: {
  videoClips: TimelineMediaClip[];
  transitions: ClipTransition[];
  selectedTransitionId: string | null;
  onSetTransition: (input: Omit<ClipTransition, "id">) => void;
  onRemoveTransition: (fromSegmentId: string, toSegmentId: string) => void;
}) {
  const boundaries = useMemo(
    () => getTimelineTransitionBoundaries(props.videoClips),
    [props.videoClips]
  );
  const [selectedKey, setSelectedKey] = useState("");
  const boundary = boundaries.find((item) => item.key === selectedKey) ?? boundaries[0] ?? null;
  const existing = boundary ? props.transitions.find((item) =>
    item.fromSegmentId === boundary.from.id && item.toSegmentId === boundary.to.id
  ) : null;
  const [type, setType] = useState<ClipTransitionType>("crossfade");
  const [duration, setDuration] = useState(0.6);

  useEffect(() => {
    if (!boundary) return;
    setSelectedKey(boundary.key);
    setType(existing?.type ?? "crossfade");
    setDuration(existing?.duration ?? Math.min(0.6, getMaxTransitionDuration(boundary)));
  }, [boundary?.key, existing?.id, existing?.type, existing?.duration]);

  // Run after the boundary defaults above so a marker click always wins on
  // first mount and opens the exact cut the user selected.
  useEffect(() => {
    const selected = props.transitions.find((item) => item.id === props.selectedTransitionId);
    if (!selected) return;
    setSelectedKey(getTransitionBoundaryKey(selected.fromSegmentId, selected.toSegmentId));
  }, [props.selectedTransitionId, props.transitions]);

  if (!boundary) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">
        <Blend size={22} />
        Add two video clips with no gap between them to create a transition.
      </div>
    );
  }

  const limit = getMaxTransitionDuration(boundary);
  return (
    <div className="grid gap-4">
      <p className="m-0 text-xs leading-relaxed text-slate-400">
        Drag a transition onto a cut in the timeline, or select a cut and apply it here.
      </p>

      <label className="grid gap-1.5 text-xs text-slate-400">
        Cut
        <select
          className="h-9 rounded-lg border border-white/10 bg-[#101012] px-2 text-xs text-white outline-none focus:border-white/40"
          value={boundary.key}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {boundaries.map((item, index) => (
            <option key={item.key} value={item.key}>
              {index + 1}. {item.from.item.name} → {item.to.item.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
        {transitionOptions.map((option) => (
          <button
            key={option.type}
            type="button"
            draggable
            title={`Drag ${option.label} onto a video cut`}
            className={`editor-choice-button rounded-lg border px-3 py-3 text-left text-xs font-semibold ${
              type === option.type
                ? "border-white bg-white/[0.1] text-white"
                : "border-white/10 bg-black/10 text-slate-300 hover:bg-white/5"
            }`}
            aria-pressed={type === option.type}
            onClick={() => setType(option.type)}
            onDragStart={(event) => {
              setType(option.type);
              event.dataTransfer.setData(transitionDragType, option.type);
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span className="flex items-center gap-2">
              <Blend size={14} /> {option.label}
            </span>
          </button>
        ))}
      </div>

      <RangeControl
        label="Duration"
        min={0.1}
        max={limit}
        step={0.1}
        value={Math.min(duration, limit)}
        formatValue={(value) => `${value.toFixed(1)}s`}
        onChange={setDuration}
      />

      <button
        type="button"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-black transition hover:bg-neutral-200"
        onClick={() => props.onSetTransition({
          fromSegmentId: boundary.from.id,
          toSegmentId: boundary.to.id,
          type,
          duration: Math.min(duration, limit)
        })}
      >
        <Blend size={15} /> {existing ? "Update transition" : "Add transition"}
      </button>

      {existing ? (
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center gap-2 rounded border border-red-400/20 text-xs text-red-300 hover:bg-red-400/10"
          onClick={() => props.onRemoveTransition(existing.fromSegmentId, existing.toSegmentId)}
        >
          <Trash2 size={14} /> Remove transition
        </button>
      ) : null}
    </div>
  );
}
