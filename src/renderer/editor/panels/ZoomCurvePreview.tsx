/** SVG curve thumbnail and animated progress marker. */
import { applyZoomEasing } from "../zoom-utils";

type Bezier = [number, number, number, number];

export function ZoomCurvePreview(props: {
  bezier: Bezier;
  large?: boolean;
  progress?: number;
}) {
  const [x1, y1, x2, y2] = props.bezier;
  const progress = props.progress ?? 0;
  const eased = applyZoomEasing(progress, { easing: "custom", bezier: props.bezier });

  return (
    <svg
      className={
        props.large
          ? "h-24 w-full rounded-lg bg-black/30 p-2 text-amber-300"
          : "h-7 w-10 text-current"
      }
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 100 L100 0"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="3"
        strokeDasharray="5 6"
      />
      <path
        d={`M0 100 C${x1 * 100} ${(1 - y1) * 100}, ${x2 * 100} ${(1 - y2) * 100}, 100 0`}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {props.large ? (
        <circle
          cx={progress * 100}
          cy={(1 - eased) * 100}
          r="4.5"
          fill="white"
          stroke="currentColor"
          strokeWidth="2"
        />
      ) : null}
    </svg>
  );
}
