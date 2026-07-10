import { useEffect, useRef, useState } from "react";
import { cx } from "../../classNames";

/**
 * Live output meter for the Audio tool. While playing it polls the playback
 * engine's peak level and colors green/amber/red so the user can see when their
 * gain is pushing the mix hot.
 */
export function AudioLevelMeter(props: { getLevel: () => number; active: boolean }) {
  const [level, setLevel] = useState(0);
  const getLevelRef = useRef(props.getLevel);
  getLevelRef.current = props.getLevel;

  useEffect(() => {
    if (!props.active) {
      setLevel(0);
      return undefined;
    }

    let raf = 0;
    let held = 0;
    const tick = () => {
      const next = getLevelRef.current();
      // Fast attack, slow release so short peaks stay readable.
      held = next > held ? next : held * 0.9;
      setLevel(held);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [props.active]);

  const percent = Math.min(100, Math.round(level * 100));
  const barColor =
    level > 0.85 ? "bg-red-500" : level > 0.6 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[0.62rem] font-bold uppercase tracking-[0.08em] text-slate-500">
        <span>Output level</span>
        <span className="tabular-nums">{props.active ? `${percent}%` : "idle"}</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cx("h-full rounded-full transition-[width] duration-75 ease-out", barColor)}
          style={{ width: `${percent}%` }}
        />
        {/* Zone guides at the amber (60%) and red (85%) thresholds. */}
        <span className="absolute inset-y-0 left-[60%] w-px bg-black/40" />
        <span className="absolute inset-y-0 left-[85%] w-px bg-black/40" />
      </div>
    </div>
  );
}
