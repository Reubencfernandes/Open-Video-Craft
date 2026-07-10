import {
  dbToLinearPercent,
  formatDb,
  maxVolumeDb,
  minVolumeDb,
  percentToSliderDb
} from "../audio-utils";

/**
 * A gain slider that presents decibels (0 dB = unity) but reports the
 * underlying linear percentage the rest of the app stores.
 */
export function DbSlider(props: {
  label: string;
  percent: number;
  onPercentChange: (percent: number) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-extrabold text-slate-400">
      <span className="flex items-center justify-between gap-3">
        {props.label}
        <output className="rounded-md bg-white/[0.06] px-2 py-1 text-white tabular-nums">
          {formatDb(props.percent)}
        </output>
      </span>
      <input
        className="w-full accent-amber-500"
        type="range"
        min={minVolumeDb}
        max={maxVolumeDb}
        step={1}
        value={percentToSliderDb(props.percent)}
        onChange={(event) => props.onPercentChange(dbToLinearPercent(Number(event.target.value)))}
      />
    </label>
  );
}
