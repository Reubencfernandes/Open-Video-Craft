/**
 * Camera content pan/zoom/mirror controls used inside the Layout panel.
 */
import { FlipHorizontal, RotateCcw } from "lucide-react";
import { RangeControl } from "../controls";
import type { CameraContentTransform } from "../types";

export function CameraCropControls(props: {
  transform: CameraContentTransform;
  onChange: (patch: Partial<CameraContentTransform>) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold text-slate-400">Camera crop</span>
        <div className="inline-flex items-center gap-1">
          <button
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-extrabold ${
              props.transform.mirrored
                ? "bg-amber-300 text-[#111827]"
                : "bg-white/[0.06] text-slate-200 hover:bg-white/10 hover:text-white"
            }`}
            type="button"
            title="Mirror camera"
            onClick={() =>
              props.onChange({
                mirrored: !props.transform.mirrored
              })
            }
          >
            <FlipHorizontal size={14} />
            Mirror
          </button>
          <button
            className="grid size-8 place-items-center rounded-md bg-white/[0.06] text-slate-200 hover:bg-white/10 hover:text-white"
            type="button"
            title="Reset camera crop"
            onClick={props.onReset}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <RangeControl
        label="Crop zoom"
        min={100}
        max={220}
        value={props.transform.scale}
        suffix="%"
        onChange={(scale) => props.onChange({ scale })}
      />
      <RangeControl
        label="Face X"
        min={-50}
        max={50}
        value={props.transform.x}
        suffix="%"
        onChange={(x) => props.onChange({ x })}
      />
      <RangeControl
        label="Face Y"
        min={-50}
        max={50}
        value={props.transform.y}
        suffix="%"
        onChange={(y) => props.onChange({ y })}
      />
    </div>
  );
}
