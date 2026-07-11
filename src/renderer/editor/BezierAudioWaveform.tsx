import { memo } from "react";
import { createBezierWaveform, createBezierWaveLine } from "./bezier-waveform";

/** Layered cubic-Bézier curves used inside audio clips on the timeline. */
export const BezierAudioWaveform = memo(function BezierAudioWaveform(props: {
  id: string;
  name: string;
}) {
  const broadCurve = createBezierWaveform(`${props.id}-${props.name}`);
  const detailCurve = createBezierWaveform(`${props.name}-${props.id}-detail`, 1000, 30);
  const centerLine = createBezierWaveLine(`${props.id}-${props.name}`);

  return (
    <span
      className="pointer-events-none absolute inset-x-2 inset-y-1 z-[1] overflow-hidden opacity-95 [mask-image:linear-gradient(90deg,transparent_0,#000_0.55rem,#000_calc(100%_-_0.55rem),transparent_100%)]"
      aria-hidden="true"
    >
      <svg className="size-full" viewBox="0 0 1000 36" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`audio-wave-${props.id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#ddd6fe" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#f5d0fe" stopOpacity="0.92" />
            <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d={broadCurve} fill={`url(#audio-wave-${props.id})`} />
        <path d={detailCurve} fill="#ffffff" fillOpacity="0.16" transform="translate(0 3)" />
        <path d={centerLine} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
});
