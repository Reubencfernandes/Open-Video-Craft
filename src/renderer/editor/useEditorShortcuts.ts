import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { isKeyboardInteractiveTarget, isKeyboardTextTarget } from "./keyboard-utils";

export type EditorShortcutsParams = {
  currentTime: number;
  currentTimeRef: MutableRefObject<number>;
  selectedTimelineSegmentId: string | null;
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

      // Text controls own their native undo/redo stack. Handling Cmd/Ctrl+Z or
      // Y here would undo an unrelated timeline edit while leaving the user's
      // in-progress text unchanged.
      if (isTyping && accel && (key === "z" || key === "y")) {
        return;
      }

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

      // Timeline regions are rendered as accessible buttons. Delete must still
      // remove the selected timeline item when one of those buttons has focus.
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        p.deleteSelected();
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

      if (event.code === "Space") {
        const target = event.target instanceof Element ? event.target : null;
        // Video editors treat Space as transport control even after a toolbar or
        // inspector button receives focus. Keep native Space only where it edits
        // a value, toggles a dedicated control, or acts inside a modal.
        const keepsNativeSpace = Boolean(
          target?.closest(
            "input, select, textarea, [contenteditable='true'], [role='dialog'], " +
            "[aria-modal='true'], [data-keep-native-space], [data-timeline-audio-mute]"
          )
        );
        if (keepsNativeSpace) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) p.togglePlayback();
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

    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
