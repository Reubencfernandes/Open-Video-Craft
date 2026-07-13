/** SVG curve thumbnail for easing preset buttons. */

type Bezier = [number, number, number, number];

export function ZoomCurvePreview(props: { bezier: Bezier }) {
  const [x1, y1, x2, y2] = props.bezier;

  return (
    <svg
      className="h-7 w-10 text-current"
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
    </svg>
  );
}
