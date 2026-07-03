import { AudioLines, ZoomIn } from "lucide-react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampNumber } from "./utils";
import type { EditorMediaItem, ZoomEffect } from "./types";

/**
 * Mini preview used by the Zoom tool: drag the dot over the frame to pick the
 * zoom focal point, and adjust the zoom scale with the slider below.
 */
export function ZoomTargetPanel(props: {
  item: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  onScaleChange: (scale: number) => void;
  onRegionChange: (region: { targetX: number; targetY: number; scale: number }) => void;
}) {
  const effect = props.selectedZoomEffect;
  const draggingRef = useRef(false);

  function moveTargetTo(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const targetX = clampNumber(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const targetY = clampNumber(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    props.onRegionChange({ targetX, targetY, scale: effect.scale });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!effect) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    moveTargetTo(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (draggingRef.current) {
      moveTargetTo(event);
    }
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  return (
    <div className="zoom-target-panel">
      <span>Drag the dot to set what the zoom focuses on</span>
      <button
        className="zoom-target-preview"
        type="button"
        disabled={!effect}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {props.item?.kind === "image" ? (
          <img src={props.item.url} alt="" />
        ) : props.item?.kind === "video" ? (
          <video src={props.item.url} muted playsInline />
        ) : (
          <div className="zoom-target-empty">
            <AudioLines size={24} />
          </div>
        )}
        {effect ? (
          <i
            className="zoom-target-dot"
            style={{
              left: `${effect.targetX}%`,
              top: `${effect.targetY}%`
            }}
          />
        ) : null}
      </button>
      <label className="zoom-scale-control">
        <span>Scale</span>
        <div>
          <ZoomIn size={15} />
          <input
            type="range"
            min={125}
            max={300}
            value={Math.round((effect?.scale ?? 1.5) * 100)}
            disabled={!effect}
            onChange={(event) => props.onScaleChange(Number(event.target.value) / 100)}
          />
          <output>{Math.round((effect?.scale ?? 1.5) * 100)} %</output>
        </div>
      </label>
    </div>
  );
}
