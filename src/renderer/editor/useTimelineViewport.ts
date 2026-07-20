/**
 * Timeline viewport: panel height resize, horizontal time-axis zoom, and
 * mapping pointer X positions to timeline time.
 */
import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  WheelEvent as ReactWheelEvent
} from "react";
import { clampNumber } from "./utils";

type UseTimelineViewportParams = {
  contentDuration: number;
  renderDuration: number;
  seek: (time: number) => void;
  timelineZoom: number;
  setTimelineZoom: Dispatch<SetStateAction<number>>;
  setTimelineViewDuration: Dispatch<SetStateAction<number>>;
};

const minTimelineZoom = 1;
const maxTimelineZoom = 10;
const timelineZoomStep = 1.5;
const timelineDurationDragSensitivity = 0.004;

/** Smooth wheel/pinch zoom shared by the handler and unit tests. */
export function getTimelineZoomAfterWheel(currentZoom: number, deltaY: number): number {
  const factor = Math.exp(-deltaY * 0.0018);
  return clampNumber(currentZoom * factor, minTimelineZoom, maxTimelineZoom);
}

/** Change visible ruler duration without ever hiding existing timeline content. */
export function getTimelineDurationAfterDrag(
  startDuration: number,
  deltaX: number,
  contentDuration: number
): number {
  const minDuration = Math.max(1, contentDuration);
  const maxDuration = Math.max(minDuration * 10, minDuration + 600);
  const factor = Math.exp(deltaX * timelineDurationDragSensitivity);
  return clampNumber(startDuration * factor, minDuration, maxDuration);
}

function getDefaultTimelinePanelHeight(): number {
  return clampNumber(Math.round(window.innerHeight * 0.3), 200, 300);
}

export function useTimelineViewport(params: UseTimelineViewportParams) {
  const {
    contentDuration,
    renderDuration,
    seek,
    setTimelineViewDuration,
    timelineZoom,
    setTimelineZoom
  } = params;
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(getDefaultTimelinePanelHeight);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeDragRef = useRef<{
    startClientY: number;
    startHeight: number;
  } | null>(null);
  const rulerDurationDragRef = useRef<{
    moved: boolean;
    startClientX: number;
    startDuration: number;
  } | null>(null);
  const timelineZoomRef = useRef(timelineZoom);
  timelineZoomRef.current = timelineZoom;

  useEffect(() => {
    const fitTimelineToWindow = () => {
      const maxHeight = Math.max(200, window.innerHeight - 220);
      setTimelinePanelHeight((height) => Math.min(height, maxHeight));
    };

    window.addEventListener("resize", fitTimelineToWindow);
    return () => window.removeEventListener("resize", fitTimelineToWindow);
  }, []);

  function getTimelineTimeFromClientX(clientX: number): number | null {
    const timelineBody = bodyRef.current;
    if (!timelineBody || renderDuration <= 0) {
      return null;
    }

    const lane = timelineBody.querySelector<HTMLElement>(".track-lane");
    const bounds = lane?.getBoundingClientRect() ?? timelineBody.getBoundingClientRect();
    if (bounds.width <= 0) {
      return null;
    }

    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    return progress * renderDuration;
  }

  function seekTimelinePointer(clientX: number) {
    const nextTime = getTimelineTimeFromClientX(clientX);
    if (nextTime !== null) {
      seek(nextTime);
    }
  }

  function beginTimelinePanelResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      startClientY: event.clientY,
      startHeight: timelinePanelHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  function updateTimelinePanelResize(clientY: number) {
    const drag = resizeDragRef.current;
    if (!drag) {
      return;
    }

    const deltaY = clientY - drag.startClientY;
    const maxHeight = Math.max(240, Math.min(620, window.innerHeight - 220));
    setTimelinePanelHeight(clampNumber(drag.startHeight - deltaY, 160, maxHeight));
  }

  function moveTimelinePanelResize(event: ReactPointerEvent<HTMLElement>) {
    updateTimelinePanelResize(event.clientY);
  }

  function endTimelinePanelResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishTimelinePanelResize();
  }

  function resetTimelinePanelHeight() {
    finishTimelinePanelResize();
    setTimelinePanelHeight(getDefaultTimelinePanelHeight());
  }

  function beginTimelineRulerDurationResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    event.preventDefault();
    rulerDurationDragRef.current = {
      moved: false,
      startClientX: event.clientX,
      startDuration: renderDuration
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  function moveTimelineRulerDurationResize(event: ReactPointerEvent<HTMLElement>) {
    const drag = rulerDurationDragRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.startClientX;
    if (!drag.moved && Math.abs(deltaX) < 3) return;
    drag.moved = true;
    setTimelineViewDuration(
      getTimelineDurationAfterDrag(drag.startDuration, deltaX, contentDuration)
    );
  }

  function finishTimelineRulerDurationResize(
    event: ReactPointerEvent<HTMLElement>,
    seekOnClick: boolean
  ) {
    const drag = rulerDurationDragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    rulerDurationDragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (drag && !drag.moved && seekOnClick) seekTimelinePointer(event.clientX);
  }

  function endTimelineRulerDurationResize(event: ReactPointerEvent<HTMLElement>) {
    finishTimelineRulerDurationResize(event, true);
  }

  function cancelTimelineRulerDurationResize(event: ReactPointerEvent<HTMLElement>) {
    finishTimelineRulerDurationResize(event, false);
  }

  function contractTimelineRulerDuration() {
    setTimelineViewDuration(
      getTimelineDurationAfterDrag(renderDuration, -30, contentDuration)
    );
  }

  function expandTimelineRulerDuration() {
    setTimelineViewDuration(
      getTimelineDurationAfterDrag(renderDuration, 30, contentDuration)
    );
  }

  function resetTimelineRulerDuration() {
    setTimelineViewDuration(contentDuration);
  }

  function finishTimelinePanelResize() {
    resizeDragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function zoomTimelineIn() {
    setTimelineZoom((zoom) => clampNumber(zoom * timelineZoomStep, minTimelineZoom, maxTimelineZoom));
  }

  function zoomTimelineOut() {
    setTimelineZoom((zoom) => clampNumber(zoom / timelineZoomStep, minTimelineZoom, maxTimelineZoom));
  }

  function resetTimelineZoom() {
    setTimelineZoom(1);
  }

  function zoomTimelineWithWheel(event: ReactWheelEvent<HTMLElement>) {
    // Ctrl is generated by trackpad pinch; Cmd + wheel is also accepted on macOS.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();

    const viewport = event.currentTarget;
    const bounds = viewport.getBoundingClientRect();
    const pointerX = Math.max(0, Math.min(viewport.clientWidth, event.clientX - bounds.left));
    const contentWidth = Math.max(1, viewport.scrollWidth);
    const anchorRatio = (viewport.scrollLeft + pointerX) / contentWidth;
    const nextZoom = getTimelineZoomAfterWheel(timelineZoomRef.current, event.deltaY);
    if (Math.abs(nextZoom - timelineZoomRef.current) < 0.0001) return;

    timelineZoomRef.current = nextZoom;
    setTimelineZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, anchorRatio * viewport.scrollWidth - pointerX);
    });
  }

  return {
    beginTimelineRulerDurationResize,
    beginTimelinePanelResize,
    bodyRef,
    cancelTimelineRulerDurationResize,
    contractTimelineRulerDuration,
    endTimelinePanelResize,
    endTimelineRulerDurationResize,
    expandTimelineRulerDuration,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    moveTimelineRulerDurationResize,
    resetTimelinePanelHeight,
    resetTimelineRulerDuration,
    resetTimelineZoom,
    seekTimelinePointer,
    timelinePanelHeight,
    timelineZoom,
    zoomTimelineWithWheel,
    zoomTimelineIn,
    zoomTimelineOut
  };
}
