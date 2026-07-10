/**
 * Timeline viewport: panel height resize, horizontal time-axis zoom, and
 * mapping pointer X positions to timeline time.
 */
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clampNumber } from "./utils";

type UseTimelineViewportParams = {
  renderDuration: number;
  seek: (time: number) => void;
};

const minTimelineZoom = 1;
const maxTimelineZoom = 10;
const timelineZoomStep = 1.5;

export function useTimelineViewport(params: UseTimelineViewportParams) {
  const { renderDuration, seek } = params;
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(360);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const resizeDragRef = useRef<{
    startClientY: number;
    startHeight: number;
  } | null>(null);

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
    setTimelinePanelHeight(360);
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

  return {
    beginTimelinePanelResize,
    bodyRef,
    endTimelinePanelResize,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    resetTimelinePanelHeight,
    resetTimelineZoom,
    seekTimelinePointer,
    timelinePanelHeight,
    timelineZoom,
    zoomTimelineIn,
    zoomTimelineOut
  };
}
