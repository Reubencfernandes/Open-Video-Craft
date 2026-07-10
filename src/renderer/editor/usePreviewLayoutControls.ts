/**
 * Pointer drag/resize of the screen and camera inside the preview frame.
 */
import { useEffect, useRef } from "react";
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
import type {
  CameraContentTransform,
  CameraFrame,
  CameraLayoutDrag,
  CameraPosition,
  EditorTool,
  LayoutMode,
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
  activeTool: EditorTool;
  cameraEditEnabled: boolean;
  cameraFrame: CameraFrame;
  layoutMode: LayoutMode;
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
    activeTool,
    cameraEditEnabled,
    cameraFrame,
    layoutMode,
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
    if (event.button !== 0 || activeTool !== "layout" || layoutMode === "camera-only") {
      return;
    }

    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const overlay = target?.hasAttribute("data-screen-edit-overlay")
      ? target
      : target?.closest<HTMLElement>("[data-screen-edit-overlay]");
    const bounds = overlay?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
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
      boundsHeight: bounds.height
    };
  }

  function updateScreenLayoutDrag(clientX: number, clientY: number) {
    const drag = screenLayoutDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    if (drag.mode === "move") {
      setScreenPosition({
        ...drag.startPosition,
        x: clampNumber(drag.startPosition.x + (deltaX / drag.boundsWidth) * 100, -120, 120),
        y: clampNumber(drag.startPosition.y + (deltaY / drag.boundsHeight) * 100, -120, 120)
      });
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
    screenLayoutDragRef.current = null;
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
      setCameraFrame(
        createCameraFrameFromPixels(
          startLeft + deltaX,
          startTop + deltaY,
          startSize,
          drag.canvasWidth,
          drag.canvasHeight
        )
      );
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
    cameraLayoutDragRef.current = null;
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
    updateCameraContentTransform
  };
}
