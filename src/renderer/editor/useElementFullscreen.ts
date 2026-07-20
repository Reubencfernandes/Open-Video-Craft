/** Fullscreen state and toggle behavior for a single editor element. */
import { useEffect, useRef, useState } from "react";

export function useElementFullscreen<T extends HTMLElement>() {
  const elementRef = useRef<T | null>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      const isNativeFullscreen = document.fullscreenElement === elementRef.current;
      setNativeFullscreen(isNativeFullscreen);
      if (isNativeFullscreen) setFallbackFullscreen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!fallbackFullscreen) return;

    const exitFallbackOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFallbackFullscreen(false);
    };
    document.addEventListener("keydown", exitFallbackOnEscape);
    return () => document.removeEventListener("keydown", exitFallbackOnEscape);
  }, [fallbackFullscreen]);

  async function toggleFullscreen() {
    const element = elementRef.current;
    if (!element) return;

    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      return;
    }

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) await document.exitFullscreen();
      if (typeof element.requestFullscreen !== "function") {
        setFallbackFullscreen(true);
        return;
      }

      // Fill the renderer immediately. Electron can leave the native
      // fullscreen promise pending indefinitely, which previously made the
      // button appear to do nothing. A successful native transition replaces
      // this fallback via the fullscreenchange listener above.
      setFallbackFullscreen(true);
      void element.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        // The viewport fallback is already active, so there is nothing else
        // to do when Chromium denies the native request.
      });
    } catch {
      // Some Electron/Chromium combinations reject the element fullscreen
      // API even for a real button click. Keep the preview control functional
      // by filling the renderer viewport; the same button and Escape exit it.
      setNativeFullscreen(false);
      setFallbackFullscreen(true);
    }
  }

  return {
    elementRef,
    fullscreen: nativeFullscreen || fallbackFullscreen,
    toggleFullscreen
  };
}
