import { memo } from "react";
import { linearPercentToDb, maxVolumeDb, minVolumeDb } from "./audio-utils";
import { createBezierWaveform, createBezierWaveLine } from "./bezier-waveform";

/**
 * Convert the stored linear gain into a useful visual height. A logarithmic dB
 * mapping mirrors the slider and keeps quiet clips visible instead of making
 * everything below unity look almost flat.
 */
function getWaveformAmplitude(volume: number, muted: boolean) {
  if (muted || volume <= 0) return 0.04;

  const db = Math.max(minVolumeDb, Math.min(maxVolumeDb, linearPercentToDb(volume)));
  const normalized = (db - minVolumeDb) / (maxVolumeDb - minVolumeDb);
  return 0.1 + normalized * 0.9;
}

/** Layered cubic-Bézier curves used inside audio clips on the timeline. */
export const BezierAudioWaveform = memo(function BezierAudioWaveform(props: {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
}) {
  const amplitude = getWaveformAmplitude(props.volume, props.muted);
  const broadCurve = createBezierWaveform(`${props.id}-${props.name}`, 1000, 36, amplitude);
  const detailCurve = createBezierWaveform(
    `${props.name}-${props.id}-detail`,
    1000,
    30,
    amplitude
  );
  const centerLine = createBezierWaveLine(`${props.id}-${props.name}`, 1000, 36, amplitude);

  return (
    <span
      className="pointer-events-none absolute inset-x-2 inset-y-1 z-[1] overflow-hidden opacity-95 [mask-image:linear-gradient(90deg,transparent_0,#000_0.55rem,#000_calc(100%_-_0.55rem),transparent_100%)]"
      aria-hidden="true"
    >
      <svg
        className="size-full transition-[filter] duration-150 ease-out"
        viewBox="0 0 1000 36"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`audio-wave-${props.id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#d1fae5" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fef3c7" stopOpacity="0.92" />
            <stop offset="1" stopColor="#6ee7b7" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path
          className="transition-[d] duration-150 ease-out"
          d={broadCurve}
          fill={`url(#audio-wave-${props.id})`}
        />
        <path d={detailCurve} fill="#ffffff" fillOpacity="0.16" transform="translate(0 3)" />
        <path d={centerLine} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
});
