/**
 * Pure viewport-grid snapping. Rectangles snap by their left/center/right and
 * top/center/bottom anchors, which makes both large screens and small camera
 * bubbles align naturally to the same composition grid.
 */
export const viewportGridColumns = 12;
export const viewportGridRows = 8;
export const viewportSnapTolerancePixels = 8;

export type ViewportSnapGuides = {
  vertical: number[];
  horizontal: number[];
};

export type ViewportSnapOverlay = {
  target: "screen" | "camera" | null;
  guides: ViewportSnapGuides;
};

export const emptyViewportSnapGuides: ViewportSnapGuides = {
  vertical: [],
  horizontal: []
};

export function snapRectangleToViewportGrid(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  tolerance?: number;
}): { left: number; top: number; guides: ViewportSnapGuides } {
  const tolerance = input.tolerance ?? viewportSnapTolerancePixels;
  const horizontal = snapAxisToGrid({
    position: input.left,
    size: input.width,
    canvasSize: input.canvasWidth,
    divisions: viewportGridColumns,
    tolerance
  });
  const vertical = snapAxisToGrid({
    position: input.top,
    size: input.height,
    canvasSize: input.canvasHeight,
    divisions: viewportGridRows,
    tolerance
  });

  return {
    left: horizontal.position,
    top: vertical.position,
    guides: {
      vertical: horizontal.guidePercent === null ? [] : [horizontal.guidePercent],
      horizontal: vertical.guidePercent === null ? [] : [vertical.guidePercent]
    }
  };
}

function snapAxisToGrid(input: {
  position: number;
  size: number;
  canvasSize: number;
  divisions: number;
  tolerance: number;
}): { position: number; guidePercent: number | null } {
  if (input.canvasSize <= 0) {
    return { position: input.position, guidePercent: null };
  }

  const anchors = [input.position, input.position + input.size / 2, input.position + input.size];
  let bestCorrection: number | null = null;
  let bestLine = 0;

  for (let index = 0; index <= input.divisions; index += 1) {
    const line = (index / input.divisions) * input.canvasSize;
    for (const anchor of anchors) {
      const correction = line - anchor;
      if (
        Math.abs(correction) <= input.tolerance &&
        (bestCorrection === null || Math.abs(correction) < Math.abs(bestCorrection))
      ) {
        bestCorrection = correction;
        bestLine = line;
      }
    }
  }

  return bestCorrection === null
    ? { position: input.position, guidePercent: null }
    : {
        position: input.position + bestCorrection,
        guidePercent: (bestLine / input.canvasSize) * 100
      };
}
