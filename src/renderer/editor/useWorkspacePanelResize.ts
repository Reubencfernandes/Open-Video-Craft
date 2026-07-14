/** Horizontal resizing and persistence for the tool/library panel. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { clampNumber } from "./utils";

export type WorkspacePanel = "library";

type WorkspaceStyle = CSSProperties & { "--editor-library-width"?: string };

const storageKey = "ovc-editor-workspace-panel-widths";
const maximumPanelWidth = 520;

function getMinimumWidths(workspaceWidth: number) {
  if (workspaceWidth <= 900) return { library: 150, preview: 250 };
  if (workspaceWidth <= 1199) return { library: 170, preview: 280 };
  return { library: 190, preview: 320 };
}

function readStoredWidth(): number | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as {
      library?: number;
    };
    return Number.isFinite(stored.library) ? stored.library ?? null : null;
  } catch {
    return null;
  }
}

function fitPanelWidth(width: number | null, workspaceWidth: number): number | null {
  if (width === null || workspaceWidth <= 720) return width;
  const minimums = getMinimumWidths(workspaceWidth);
  return clampNumber(
    width,
    minimums.library,
    Math.min(maximumPanelWidth, workspaceWidth - minimums.preview)
  );
}

export function useWorkspacePanelResize() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(readStoredWidth);
  const resizeDragRef = useRef<{
    startClientX: number;
    startWidth: number;
    workspaceWidth: number;
  } | null>(null);

  const workspaceStyle = useMemo<WorkspaceStyle>(() => (
    panelWidth === null ? {} : { "--editor-library-width": `${panelWidth}px` }
  ), [panelWidth]);

  useEffect(() => {
    if (panelWidth === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify({ library: panelWidth }));
  }, [panelWidth]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const fitToWorkspace = () => {
      const workspaceWidth = workspace.getBoundingClientRect().width;
      setPanelWidth((current) => fitPanelWidth(current, workspaceWidth));
    };
    fitToWorkspace();
    const resizeObserver = new ResizeObserver(fitToWorkspace);
    resizeObserver.observe(workspace);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => () => finishResize(), []);

  function measureWorkspace() {
    const workspace = workspaceRef.current;
    const library = workspace?.querySelector<HTMLElement>(".editor-library");
    if (!workspace || !library) return null;
    return {
      workspaceWidth: workspace.getBoundingClientRect().width,
      libraryWidth: library.getBoundingClientRect().width
    };
  }

  function clampWidth(width: number, workspaceWidth: number) {
    const minimums = getMinimumWidths(workspaceWidth);
    return clampNumber(
      width,
      minimums.library,
      Math.min(maximumPanelWidth, workspaceWidth - minimums.preview)
    );
  }

  function beginPanelResize(event: ReactPointerEvent<HTMLElement>, _panel: WorkspacePanel) {
    if (event.button !== 0) return;
    const measurements = measureWorkspace();
    if (!measurements || measurements.workspaceWidth <= 720) return;

    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      startClientX: event.clientX,
      startWidth: measurements.libraryWidth,
      workspaceWidth: measurements.workspaceWidth
    };
    setPanelWidth(measurements.libraryWidth);
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function movePanelResize(event: ReactPointerEvent<HTMLElement>) {
    const drag = resizeDragRef.current;
    if (!drag) return;
    setPanelWidth(clampWidth(
      drag.startWidth + event.clientX - drag.startClientX,
      drag.workspaceWidth
    ));
  }

  function endPanelResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishResize();
  }

  function finishResize() {
    resizeDragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function nudgePanelWidth(_panel: WorkspacePanel, edgeDelta: number) {
    const measurements = measureWorkspace();
    if (!measurements || measurements.workspaceWidth <= 720) return;
    setPanelWidth(clampWidth(
      measurements.libraryWidth + edgeDelta,
      measurements.workspaceWidth
    ));
  }

  function resetPanelWidth(_panel: WorkspacePanel) {
    finishResize();
    setPanelWidth(null);
  }

  return {
    beginPanelResize,
    endPanelResize,
    movePanelResize,
    nudgePanelWidth,
    resetPanelWidth,
    workspaceRef,
    workspaceStyle
  };
}
