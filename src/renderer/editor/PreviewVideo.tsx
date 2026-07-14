/**
 * Shared preview video renderer. High mode displays the source video directly;
 * Low mode keeps that decoder as the playback clock and paints a 640 px frame
 * to canvas, so quality changes never alter project media or timing.
 */
import { useCallback, useEffect, useRef } from "react";
import type {
  MutableRefObject,
  RefObject,
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
  ...videoProps
}: PreviewVideoProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const assignVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      localVideoRef.current = element;
      (videoRef as MutableRefObject<HTMLVideoElement | null>).current = element;
    },
    [videoRef]
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
  }, [quality, src]);

  return (
    <>
      <video
        {...videoProps}
        ref={assignVideoRef}
        className={className}
        style={{ ...style, opacity: quality === "low" ? 0 : style?.opacity }}
        src={src}
      />
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
