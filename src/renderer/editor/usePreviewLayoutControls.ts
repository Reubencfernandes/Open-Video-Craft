/**
 * Pointer drag/resize of the screen and camera inside the preview frame.
 */
import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { clampCameraContentTransform } from "./camera-content-transform";
import {
  createCameraFrameFromPixels,
  getCameraFrameFromPreset,
  getScreenResizeDirection,
  resizeCameraFrameAroundCenter
} from "./layout-geometry";
import {
  emptyViewportSnapGuides,
  snapRectangleToViewportGrid,
  type ViewportSnapOverlay
} from "./layout-snapping";
import type {
  CameraContentTransform,
  CameraFrame,
  CameraLayoutDrag,
  CameraPosition,
  ScreenLayoutDrag,
  ScreenLayoutDragMode
} from "./types";
import { clampNumber } from "./utils";

type ScreenPosition = {
  x: number;
  y: number;
  scale: number;
};

type UsePreviewLayoutControlsParams = {
  cameraEditEnabled: boolean;
  cameraFrame: CameraFrame;
  screenEditEnabled: boolean;
  screenPosition: ScreenPosition;
  setCameraContentTransform: Dispatch<SetStateAction<CameraContentTransform>>;
  setCameraFrame: Dispatch<SetStateAction<CameraFrame>>;
  setCameraPosition: Dispatch<SetStateAction<CameraPosition>>;
  setCameraSize: Dispatch<SetStateAction<number>>;
  setScreenPosition: Dispatch<SetStateAction<ScreenPosition>>;
};

export function usePreviewLayoutControls(params: UsePreviewLayoutControlsParams) {
  const {
    cameraEditEnabled,
    cameraFrame,
    screenEditEnabled,
    screenPosition,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraSize,
    setScreenPosition
  } = params;

  const screenLayoutDragRef = useRef<ScreenLayoutDrag | null>(null);
  const cameraLayoutDragRef = useRef<CameraLayoutDrag | null>(null);
  const [snapOverlay, setSnapOverlay] = useState<ViewportSnapOverlay>({
    target: null,
    guides: emptyViewportSnapGuides
  });

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      updateScreenLayoutDrag(event.clientX, event.clientY);
      updateCameraLayoutDrag(event.clientX, event.clientY);
    }

    function handlePointerUp() {
      finishScreenLayoutDrag();
      finishCameraLayoutDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (!screenEditEnabled) {
      finishScreenLayoutDrag();
    }
  }, [screenEditEnabled]);

  useEffect(() => {
    if (!cameraEditEnabled) {
      finishCameraLayoutDrag();
    }
  }, [cameraEditEnabled]);

  function beginScreenLayoutDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) {
    if (event.button !== 0 || !screenEditEnabled) {
      return;
    }

    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const overlay = target?.hasAttribute("data-screen-edit-overlay")
      ? target
      : target?.closest<HTMLElement>("[data-screen-edit-overlay]");
    const bounds = overlay?.getBoundingClientRect();
    const canvasBounds = overlay?.parentElement?.getBoundingClientRect();
    if (
      !bounds ||
      !canvasBounds ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      canvasBounds.width <= 0 ||
      canvasBounds.height <= 0
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    screenLayoutDragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: screenPosition,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      canvasWidth: canvasBounds.width,
      canvasHeight: canvasBounds.height,
      startBoundsLeft: bounds.left - canvasBounds.left,
      startBoundsTop: bounds.top - canvasBounds.top,
      // CSS translate percentages use the untransformed element box.
      translationWidth: Math.max(1, overlay?.offsetWidth ?? bounds.width),
      translationHeight: Math.max(1, overlay?.offsetHeight ?? bounds.height)
    };
    setSnapOverlay({ target: "screen", guides: emptyViewportSnapGuides });
  }

  function updateScreenLayoutDrag(clientX: number, clientY: number) {
    const drag = screenLayoutDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    if (drag.mode === "move") {
      const rawLeft = drag.startBoundsLeft + deltaX;
      const rawTop = drag.startBoundsTop + deltaY;
      const snapped = snapRectangleToViewportGrid({
        left: rawLeft,
        top: rawTop,
        width: drag.boundsWidth,
        height: drag.boundsHeight,
        canvasWidth: drag.canvasWidth,
        canvasHeight: drag.canvasHeight
      });
      const snappedDeltaX = deltaX + (snapped.left - rawLeft);
      const snappedDeltaY = deltaY + (snapped.top - rawTop);
      setScreenPosition({
        ...drag.startPosition,
        x: clampNumber(
          drag.startPosition.x + (snappedDeltaX / drag.translationWidth) * 100,
          -120,
          120
        ),
        y: clampNumber(
          drag.startPosition.y + (snappedDeltaY / drag.translationHeight) * 100,
          -120,
          120
        )
      });
      setSnapOverlay({ target: "screen", guides: snapped.guides });
      return;
    }

    const direction = getScreenResizeDirection(drag.mode);
    const scaleDelta =
      (((deltaX * direction.x) / drag.boundsWidth +
        (deltaY * direction.y) / drag.boundsHeight) /
        2) *
      100;
    setScreenPosition({
      ...drag.startPosition,
      scale: clampNumber(drag.startPosition.scale + scaleDelta, 35, 220)
    });
  }

  function finishScreenLayoutDrag() {
    if (!screenLayoutDragRef.current) {
      return;
    }
    screenLayoutDragRef.current = null;
    setSnapOverlay({ target: null, guides: emptyViewportSnapGuides });
  }

  function beginCameraLayoutDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) {
    if (event.button !== 0 || !cameraEditEnabled) {
      return;
    }

    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const overlay = target?.hasAttribute("data-camera-edit-overlay")
      ? target
      : target?.closest<HTMLElement>("[data-camera-edit-overlay]");
    const bounds = overlay?.getBoundingClientRect();
    const canvasBounds = overlay?.parentElement?.getBoundingClientRect();
    if (
      !bounds ||
      !canvasBounds ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      canvasBounds.width <= 0 ||
      canvasBounds.height <= 0
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cameraLayoutDragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: cameraFrame,
      canvasWidth: canvasBounds.width,
      canvasHeight: canvasBounds.height
    };
    setSnapOverlay({ target: "camera", guides: emptyViewportSnapGuides });
  }

  function updateCameraLayoutDrag(clientX: number, clientY: number) {
    const drag = cameraLayoutDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    const startLeft = (drag.startFrame.x / 100) * drag.canvasWidth;
    const startTop = (drag.startFrame.y / 100) * drag.canvasHeight;
    const startSize = (drag.startFrame.size / 100) * drag.canvasWidth;

    if (drag.mode === "move") {
      const snapped = snapRectangleToViewportGrid({
        left: startLeft + deltaX,
        top: startTop + deltaY,
        width: startSize,
        height: startSize,
        canvasWidth: drag.canvasWidth,
        canvasHeight: drag.canvasHeight
      });
      setCameraFrame(
        createCameraFrameFromPixels(
          snapped.left,
          snapped.top,
          startSize,
          drag.canvasWidth,
          drag.canvasHeight
        )
      );
      setSnapOverlay({ target: "camera", guides: snapped.guides });
      return;
    }

    const direction = getScreenResizeDirection(drag.mode);
    const horizontalDelta = direction.x === 0 ? null : deltaX * direction.x;
    const verticalDelta = direction.y === 0 ? null : deltaY * direction.y;
    const resizeComponents = [horizontalDelta, verticalDelta].filter(
      (value): value is number => value !== null
    );
    const sizeDelta =
      resizeComponents.reduce((total, value) => total + value, 0) /
      Math.max(1, resizeComponents.length);
    const nextSize = startSize + sizeDelta;
    const nextLeft = direction.x < 0 ? startLeft + startSize - nextSize : startLeft;
    const nextTop = direction.y < 0 ? startTop + startSize - nextSize : startTop;

    setCameraFrame(
      createCameraFrameFromPixels(
        nextLeft,
        nextTop,
        nextSize,
        drag.canvasWidth,
        drag.canvasHeight
      )
    );
  }

  function finishCameraLayoutDrag() {
    if (!cameraLayoutDragRef.current) {
      return;
    }
    cameraLayoutDragRef.current = null;
    setSnapOverlay({ target: null, guides: emptyViewportSnapGuides });
  }

  function selectCameraPosition(position: CameraPosition) {
    setCameraPosition(position);
    setCameraFrame((current) => getCameraFrameFromPreset(position, current.size));
  }

  function selectCameraSize(size: number) {
    setCameraSize(size);
    setCameraFrame((current) => resizeCameraFrameAroundCenter(current, size));
  }

  function updateCameraContentTransform(patch: Partial<CameraContentTransform>) {
    setCameraContentTransform((current) =>
      clampCameraContentTransform({
        ...current,
        ...patch
      })
    );
  }

  function resetCameraContentTransform() {
    setCameraContentTransform({
      x: 0,
      y: 0,
      scale: 100,
      mirrored: false
    });
  }

  return {
    beginCameraLayoutDrag,
    beginScreenLayoutDrag,
    resetCameraContentTransform,
    selectCameraPosition,
    selectCameraSize,
    snapOverlay,
    updateCameraContentTransform
  };
}
