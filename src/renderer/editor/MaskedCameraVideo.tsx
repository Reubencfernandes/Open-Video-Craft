/**
 * Webcam preview with the background removed (S9).
 *
 * The bundled ffmpeg cannot encode VP9 with alpha, so transparency is composed
 * here: the recorded camera frame is drawn to a canvas and the generated mask
 * replaces its alpha channel. The original <video> element stays in the DOM and
 * keeps owning playback: this component follows its time, so scrubbing, pauses
 * and speed changes behave exactly as before.
 */
import { useEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PreviewQuality } from "./editor-state-storage";
import { maskAlphaIntoFrame, samePixelCount } from "./mask-composite";

/** Work at the mask's own resolution; CSS scales the result to the bubble. */
const canvasSize = 512;

export function MaskedCameraVideo(props: {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly cameraUrl: string;
  readonly maskUrl: string;
  readonly quality: PreviewQuality;
  readonly videoStyle?: CSSProperties;
  readonly onReady?: () => void;
  readonly className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskVideoRef = useRef<HTMLVideoElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const maskVideo = maskVideoRef.current;
    const camera = props.videoRef.current;
    if (!canvas || !maskVideo || !camera) return undefined;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    const maskCanvas = maskCanvasRef.current ?? document.createElement("canvas");
    maskCanvasRef.current = maskCanvas;
    maskCanvas.width = canvasSize;
    maskCanvas.height = canvasSize;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !maskContext) return undefined;

    let frameHandle = 0;

    const syncMask = (): void => {
      // Follow the camera's clock instead of playing independently, and only
      // correct real drift so the mask never seeks on every frame.
      if (Math.abs(maskVideo.currentTime - camera.currentTime) > 0.08) {
        maskVideo.currentTime = camera.currentTime;
      }
      if (camera.paused && !maskVideo.paused) maskVideo.pause();
      if (!camera.paused && maskVideo.paused) void maskVideo.play().catch(() => undefined);
    };

    const draw = (): void => {
      frameHandle = requestAnimationFrame(draw);
      if (camera.readyState < 2 || maskVideo.readyState < 2) return;
      syncMask();

      context.clearRect(0, 0, canvasSize, canvasSize);
      context.drawImage(camera, 0, 0, canvasSize, canvasSize);
      maskContext.clearRect(0, 0, canvasSize, canvasSize);
      maskContext.drawImage(maskVideo, 0, 0, canvasSize, canvasSize);

      const frame = context.getImageData(0, 0, canvasSize, canvasSize);
      const mask = maskContext.getImageData(0, 0, canvasSize, canvasSize);
      if (!samePixelCount(frame.data, mask.data)) return;
      // The mask video is grayscale: its red channel is the alpha to apply.
      maskAlphaIntoFrame(frame.data, mask.data);
      context.putImageData(frame, 0, 0);
    };

    frameHandle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameHandle);
  }, [props.videoRef, props.cameraUrl, props.maskUrl]);

  return (
    <>
      <video
        ref={props.videoRef}
        className="pointer-events-none absolute size-0 opacity-0"
        src={props.cameraUrl}
        crossOrigin="anonymous"
        playsInline
        muted
        onCanPlay={props.onReady}
      />
      <video
        ref={maskVideoRef}
        className="pointer-events-none absolute size-0 opacity-0"
        src={props.maskUrl}
        crossOrigin="anonymous"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className={props.className ?? "absolute inset-0 size-full border-0 bg-transparent"}
        style={props.videoStyle}
        data-masked-camera
      />
    </>
  );
}
