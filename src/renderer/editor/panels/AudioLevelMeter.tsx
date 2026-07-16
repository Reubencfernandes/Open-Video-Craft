import { useEffect, useRef, useState } from "react";
import {
  meterAmberDb,
  meterFloorDb,
  meterRedDb,
  peakToMeterPercent
} from "../audio-utils";

const amberPercent = ((meterAmberDb - meterFloorDb) / -meterFloorDb) * 100;
const redPercent = ((meterRedDb - meterFloorDb) / -meterFloorDb) * 100;
const meterGradient = `linear-gradient(to right, #10b981 0 ${amberPercent}%, #f59e0b ${amberPercent}% ${redPercent}%, #ef4444 ${redPercent}% 100%)`;

/** Mixed-output sample peak meter with persistent dBFS color zones. */
export function AudioLevelMeter(props: { getLevel: () => number; active: boolean }) {
  const [peak, setPeak] = useState(0);
  const getLevelRef = useRef(props.getLevel);
  getLevelRef.current = props.getLevel;

  useEffect(() => {
    if (!props.active) {
      setPeak(0);
      return undefined;
    }

    let raf = 0;
    let held = 0;
    const tick = () => {
      const next = getLevelRef.current();
      held = next > held ? next : held * 0.92;
      setPeak(held);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [props.active]);

  const percent = peakToMeterPercent(peak);

  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="absolute inset-0 opacity-25" style={{ background: meterGradient }} />
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-75 ease-out"
          style={{ width: `${percent}%`, background: meterGradient }}
        />
        <span className="absolute inset-y-0 w-px bg-black/60" style={{ left: `${amberPercent}%` }} />
        <span className="absolute inset-y-0 w-px bg-black/60" style={{ left: `${redPercent}%` }} />
      </div>
    </div>
  );
}
