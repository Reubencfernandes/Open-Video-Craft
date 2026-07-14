import { Blend, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ClipTransition, ClipTransitionType, TimelineMediaClip } from "../types";

const transitionOptions: Array<{ type: ClipTransitionType; label: string }> = [
  { type: "crossfade", label: "Crossfade" },
  { type: "fade-black", label: "Fade black" },
  { type: "slide-left", label: "Slide left" },
  { type: "wipe-left", label: "Wipe left" }
];

type Boundary = { key: string; from: TimelineMediaClip; to: TimelineMediaClip };

/** Controls the transition centered on one adjacent video-clip cut. */
export function TransitionPanel(props: {
  videoClips: TimelineMediaClip[];
  transitions: ClipTransition[];
  onSetTransition: (input: Omit<ClipTransition, "id">) => void;
  onRemoveTransition: (fromSegmentId: string, toSegmentId: string) => void;
}) {
  const boundaries = useMemo(() => getBoundaries(props.videoClips), [props.videoClips]);
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
    setDuration(existing?.duration ?? Math.min(0.6, maxDuration(boundary)));
  }, [boundary?.key, existing?.id, existing?.type, existing?.duration]);

  if (!boundary) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">
        <Blend size={22} />
        Add two video clips with no gap between them to create a transition.
      </div>
    );
  }

  const limit = maxDuration(boundary);
  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5 text-xs text-slate-400">
        Cut
        <select
          className="h-9 rounded border border-white/10 bg-[#11151b] px-2 text-xs text-white outline-none focus:border-[#c9ad73]"
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

      <div className="grid grid-cols-2 gap-2">
        {transitionOptions.map((option) => (
          <button
            key={option.type}
            type="button"
            className={`rounded-lg border px-3 py-3 text-left text-xs font-semibold transition ${
              type === option.type
                ? "border-[#c9ad73] bg-[#c9ad73]/10 text-[#e7cf9b]"
                : "border-white/10 bg-black/10 text-slate-300 hover:bg-white/5"
            }`}
            onClick={() => setType(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="grid gap-2 text-xs text-slate-400">
        <span className="flex justify-between"><span>Duration</span><strong className="text-white">{duration.toFixed(1)}s</strong></span>
        <input
          type="range"
          min={0.1}
          max={limit}
          step={0.1}
          value={Math.min(duration, limit)}
          onChange={(event) => setDuration(Number(event.target.value))}
          className="accent-[#c9ad73]"
        />
      </label>

      <button
        type="button"
        className="inline-flex h-9 items-center justify-center gap-2 rounded bg-[#c9ad73] px-3 text-xs font-bold text-[#17130c]"
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

function getBoundaries(clips: TimelineMediaClip[]): Boundary[] {
  const ordered = [...clips].sort((a, b) => a.start - b.start);
  return ordered.slice(0, -1).flatMap((from, index) => {
    const to = ordered[index + 1];
    return Math.abs(from.start + from.duration - to.start) <= 0.05
      ? [{ key: `${from.id}\u0000${to.id}`, from, to }]
      : [];
  });
}

function maxDuration(boundary: Boundary): number {
  return Math.max(0.1, Math.min(2, (boundary.from.duration - 0.1) * 2, (boundary.to.duration - 0.1) * 2));
}
