/** Reusable vertical drag handle for resizable editor workspace panels. */
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";

export function WorkspaceResizeHandle(props: {
  edge: "left" | "right";
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onNudge: (deltaX: number) => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    props.onNudge(event.key === "ArrowRight" ? 12 : -12);
  }

  return (
    <div
      className={`workspace-resize-handle group absolute inset-y-0 z-30 w-3 cursor-col-resize touch-none outline-none ${
        props.edge === "left" ? "left-0" : "right-0"
      }`}
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      tabIndex={0}
      title={`${props.label}. Drag to resize; double-click to reset.`}
      onKeyDown={handleKeyDown}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerUp}
      onDoubleClick={props.onDoubleClick}
    >
      <span
        className={`absolute inset-y-0 w-px bg-white/10 transition group-hover:bg-white/40 group-focus-visible:bg-white/60 ${
          props.edge === "left" ? "left-0" : "right-0"
        }`}
      />
    </div>
  );
}
