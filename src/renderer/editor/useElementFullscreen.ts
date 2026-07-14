/** Fullscreen state and toggle behavior for a single editor element. */
import { useEffect, useRef, useState } from "react";

export function useElementFullscreen<T extends HTMLElement>() {
  const elementRef = useRef<T | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      setFullscreen(document.fullscreenElement === elementRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === elementRef.current) {
        await document.exitFullscreen();
        return;
      }
      await elementRef.current?.requestFullscreen();
    } catch {
      setFullscreen(false);
    }
  }

  return { elementRef, fullscreen, toggleFullscreen };
}
