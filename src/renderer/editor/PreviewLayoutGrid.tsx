/** Composition grid and active snap guides shown only during viewport drags. */
import {
  viewportGridColumns,
  viewportGridRows,
  type ViewportSnapOverlay
} from "./layout-snapping";

export function PreviewLayoutGrid(props: { overlay: ViewportSnapOverlay }) {
  if (!props.overlay.target) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.24) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.24) 1px, transparent 1px)",
          backgroundSize: `${100 / viewportGridColumns}% 100%, 100% ${100 / viewportGridRows}%`
        }}
      />
      {props.overlay.guides.vertical.map((position) => (
        <span
          className="absolute inset-y-0 w-px -translate-x-1/2 bg-cyan-300 shadow-[0_0_8px_rgb(103_232_249_/_0.9)]"
          style={{ left: `${position}%` }}
          key={`vertical-${position}`}
        />
      ))}
      {props.overlay.guides.horizontal.map((position) => (
        <span
          className="absolute inset-x-0 h-px -translate-y-1/2 bg-cyan-300 shadow-[0_0_8px_rgb(103_232_249_/_0.9)]"
          style={{ top: `${position}%` }}
          key={`horizontal-${position}`}
        />
      ))}
    </div>
  );
}
