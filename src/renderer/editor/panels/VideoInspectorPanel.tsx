/** Video transform and compositing controls shown in the right inspector. */
import { FlipHorizontal2, FlipVertical2, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { CameraContentTransform } from "../types";

const fieldClassName =
  "h-9 min-w-0 rounded-lg border border-white/[0.05] bg-white/[0.045] px-3 text-sm text-white outline-none focus:border-amber-400/50";

export function VideoInspectorPanel(props: {
  scale: number;
  transform: CameraContentTransform;
  onScaleChange: (value: number) => void;
  onTransformChange: (patch: Partial<CameraContentTransform>) => void;
  onReset: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);

  const resetTransform = () => {
    props.onScaleChange(100);
    props.onReset();
    setRotation(0);
  };

  return (
    <div className="grid gap-5 text-[0.78rem] text-slate-200">
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[0.92rem] font-semibold text-white">Transform</h3>
          <button className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" type="button" title="Reset transform" onClick={resetTransform}>
            <RotateCcw size={15} />
          </button>
        </div>

        <label className="grid gap-2">
          <span>Scale</span>
          <span className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
            <input className="w-full accent-amber-400" type="range" min="25" max="200" value={props.scale} onChange={(event) => props.onScaleChange(Number(event.target.value))} />
            <span className={`${fieldClassName} grid place-items-center tabular-nums`}>{props.scale}%</span>
          </span>
        </label>

        <div className="grid gap-2">
          <span>Position</span>
          <div className="grid grid-cols-2 gap-3">
            <label className={`${fieldClassName} flex items-center gap-2`}>
              <span className="text-slate-500">X</span>
              <input className="min-w-0 flex-1 bg-transparent text-white outline-none tabular-nums" type="number" value={Math.round(props.transform.x)} onChange={(event) => props.onTransformChange({ x: Number(event.target.value) })} />
            </label>
            <label className={`${fieldClassName} flex items-center gap-2`}>
              <span className="text-slate-500">Y</span>
              <input className="min-w-0 flex-1 bg-transparent text-white outline-none tabular-nums" type="number" value={Math.round(props.transform.y)} onChange={(event) => props.onTransformChange({ y: Number(event.target.value) })} />
            </label>
          </div>
        </div>

        <label className="grid gap-2">
          <span>Rotate</span>
          <span className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
            <input className="w-full accent-amber-400" type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} />
            <span className={`${fieldClassName} grid place-items-center tabular-nums`}>{rotation}°</span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <span className="min-w-10">Flip</span>
          <button className={`grid h-8 w-14 place-items-center rounded-lg border border-white/[0.04] ${props.transform.mirrored ? "bg-amber-500/15 text-amber-300" : "bg-white/[0.04] text-slate-300"}`} type="button" title="Flip horizontally" onClick={() => props.onTransformChange({ mirrored: !props.transform.mirrored })}>
            <FlipHorizontal2 size={16} />
          </button>
          <button className="grid h-8 w-14 place-items-center rounded-lg border border-white/[0.04] bg-white/[0.04] text-slate-300" type="button" title="Flip vertically">
            <FlipVertical2 size={16} />
          </button>
        </div>
      </section>

      <section className="grid gap-4 border-t border-white/[0.07] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[0.92rem] font-semibold text-white">Compositing</h3>
          <RotateCcw size={15} className="text-slate-400" />
        </div>
        <label className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-3">
          <span>Blend Mode</span>
          <select className="themed-select h-9" defaultValue="normal"><option value="normal">Normal</option></select>
        </label>
        <label className="grid gap-2">
          <span>Opacity</span>
          <span className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
            <input className="w-full accent-amber-400" type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
            <span className={`${fieldClassName} grid place-items-center tabular-nums`}>{opacity}%</span>
          </span>
        </label>
      </section>
    </div>
  );
}
