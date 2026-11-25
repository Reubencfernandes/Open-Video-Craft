/**
 * Shared preview video renderer. High mode displays the source video directly;
 * Low mode keeps that decoder as the playback clock and paints a 640 px frame
 * to canvas, so quality changes never alter project media or timing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MutableRefObject,
  RefObject,
  SyntheticEvent,
  VideoHTMLAttributes
} from "react";
import {
  lowQualityPreviewMaxEdge,
  type PreviewQuality
} from "./preview-quality";

type PreviewVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "ref"> & {
  quality: PreviewQuality;
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function PreviewVideo({
  quality,
  videoRef,
  className,
  style,
  src,
  onLoadedData,
  onSeeked,
  ...videoProps
}: PreviewVideoProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Two persistent decoders, so a clip swap loads the incoming source while the
  // outgoing one keeps painting its last frame. Swapping `src` in place instead
  // blanks the element until the new source has data, which reads as a flash at
  // every cut between different media.
  const [presentedSrc, setPresentedSrc] = useState(src);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);

  const pendingSrc = presentedSrc === src ? null : src;
  const driverSlot = pendingSrc === null ? activeSlot : activeSlot === 0 ? 1 : 0;
  const driverSrc = pendingSrc ?? presentedSrc;

  const assignVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      localVideoRef.current = element;
      (videoRef as MutableRefObject<HTMLVideoElement | null>).current = element;
    },
    [videoRef]
  );

  const retainFrameRef = useCallback((element: HTMLVideoElement | null) => {
    // The outgoing decoder must freeze on its last frame, otherwise it keeps
    // playing past the cut and shows frames the edit removed.
    element?.pause();
  }, []);

  const promotePendingSrc = useCallback(() => {
    const video = localVideoRef.current;
    if (!video || !pendingSrc) {
      return;
    }
    if (video.seeking || video.getAttribute("src") !== pendingSrc) {
      return;
    }
    setPresentedSrc(pendingSrc);
    setActiveSlot((slot) => (slot === 0 ? 1 : 0));
  }, [pendingSrc]);

  const handleLoadedData = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      promotePendingSrc();
      onLoadedData?.(event);
    },
    [onLoadedData, promotePendingSrc]
  );

  const handleSeeked = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      promotePendingSrc();
      onSeeked?.(event);
    },
    [onSeeked, promotePendingSrc]
  );

  useEffect(() => {
    const video = localVideoRef.current;
    const canvas = canvasRef.current;
    if (quality !== "low" || !video || !canvas) {
      return undefined;
    }

    let frameRequest: number | null = null;
    const drawFrame = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        return;
      }

      const scale = Math.min(
        1,
        lowQualityPreviewMaxEdge / Math.max(sourceWidth, sourceHeight)
      );
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.getContext("2d", { alpha: false })?.drawImage(video, 0, 0, width, height);
    };

    const requestNextFrame = () => {
      drawFrame();
      frameRequest = video.requestVideoFrameCallback(requestNextFrame);
    };

    frameRequest = video.requestVideoFrameCallback(requestNextFrame);
    video.addEventListener("loadeddata", drawFrame);
    video.addEventListener("seeked", drawFrame);
    video.addEventListener("timeupdate", drawFrame);
    drawFrame();

    return () => {
      if (frameRequest !== null) {
        video.cancelVideoFrameCallback(frameRequest);
      }
      video.removeEventListener("loadeddata", drawFrame);
      video.removeEventListener("seeked", drawFrame);
      video.removeEventListener("timeupdate", drawFrame);
    };
  }, [quality, driverSrc]);

  const renderSlot = (slot: 0 | 1) => {
    const isActive = slot === activeSlot;
    const isDriver = slot === driverSlot;
    return (
      <video
        key={slot}
        {...videoProps}
        ref={isDriver ? assignVideoRef : retainFrameRef}
        className={className}
        style={{
          ...style,
          opacity: quality === "low" ? 0 : isActive ? style?.opacity : 0
        }}
        src={isActive ? presentedSrc : pendingSrc ?? undefined}
        onLoadedData={isDriver ? handleLoadedData : undefined}
        onSeeked={isDriver ? handleSeeked : undefined}
      />
    );
  };

  return (
    <>
      {renderSlot(0)}
      {renderSlot(1)}
      {quality === "low" ? (
        <canvas
          ref={canvasRef}
          className={className}
          style={style}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
