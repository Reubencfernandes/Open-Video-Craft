import {
  dbToLinearPercent,
  formatDb,
  maxVolumeDb,
  minVolumeDb,
  percentToSliderDb
} from "../audio-utils";
import { RangeControl } from "../controls";

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
    <RangeControl
      label={props.label}
      min={minVolumeDb}
      max={maxVolumeDb}
      step={1}
      value={percentToSliderDb(props.percent)}
      formatValue={() => formatDb(props.percent)}
      onChange={(value) => props.onPercentChange(dbToLinearPercent(value))}
    />
  );
}
