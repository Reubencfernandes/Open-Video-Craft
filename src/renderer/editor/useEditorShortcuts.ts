import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { isKeyboardInteractiveTarget, isKeyboardTextTarget } from "./keyboard-utils";
import type { EditorTool } from "./types";

export type EditorShortcutsParams = {
  activeTool: EditorTool;
  currentTime: number;
  currentTimeRef: MutableRefObject<number>;
  selectedTimelineSegmentId: string | null;
  selectedZoomId: string | null;
  selectedSpeedId: string | null;
  hasTimelineRangeSelection: boolean;
  seek: (time: number) => void;
  undo: () => void;
  redo: () => void;
  openExport: () => void;
  copyClip: () => void;
  cutClip: () => void;
  pasteClip: () => void;
  splitAtPlayhead: (segmentId: string | null, time: number) => void;
  togglePlayback: () => void;
  removeZoom: (id: string) => void;
  removeSpeed: (id: string) => void;
  deleteSelected: () => void;
};

/**
 * Global editor keyboard shortcuts. Copy/cut/paste and split use the platform
 * accelerator (Cmd on macOS, Ctrl elsewhere); arrows scrub the playhead.
 *
 * The latest params are held in a ref so the window listener is attached once
 * and always sees current state instead of re-subscribing on every render.
 */
export function useEditorShortcuts(params: EditorShortcutsParams) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    function seekBy(deltaSeconds: number) {
      const p = paramsRef.current;
      p.seek(p.currentTimeRef.current + deltaSeconds);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const p = paramsRef.current;
      const isTyping = isKeyboardTextTarget(event.target);
      const isInteractive = isKeyboardInteractiveTarget(event.target);
      const accel = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (accel && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          p.redo();
          return;
        }
        p.undo();
        return;
      }

      if (accel && key === "y") {
        event.preventDefault();
        p.redo();
        return;
      }

      if (isTyping) {
        return;
      }

      // Ctrl/Cmd+E opens export.
      if (accel && key === "e") {
        event.preventDefault();
        p.openExport();
        return;
      }

      // Clip clipboard: copy, cut (copy + delete), paste at the playhead.
      if (accel && key === "c") {
        event.preventDefault();
        p.copyClip();
        return;
      }

      if (accel && key === "x") {
        event.preventDefault();
        p.cutClip();
        return;
      }

      if (accel && key === "v") {
        event.preventDefault();
        p.pasteClip();
        return;
      }

      if (isInteractive) {
        return;
      }

      // Ctrl/Cmd+B blades the selected clip at the playhead.
      if (accel && key === "b") {
        event.preventDefault();
        p.splitAtPlayhead(p.selectedTimelineSegmentId, p.currentTime);
        return;
      }

      // Arrow seeking: 1s, Shift = 10s, Ctrl/Cmd = 60s. A focused range slider
      // keeps its own arrow behavior.
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement && activeElement.type === "range") {
          return;
        }

        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const step = accel ? 60 : event.shiftKey ? 10 : 1;
        seekBy(direction * step);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) {
          return;
        }

        p.togglePlayback();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (p.selectedTimelineSegmentId || p.hasTimelineRangeSelection) {
          p.deleteSelected();
          return;
        }

        if (p.activeTool === "zoom" && p.selectedZoomId) {
          p.removeZoom(p.selectedZoomId);
          return;
        }

        if (p.activeTool === "speed" && p.selectedSpeedId) {
          p.removeSpeed(p.selectedSpeedId);
          return;
        }

        p.deleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
