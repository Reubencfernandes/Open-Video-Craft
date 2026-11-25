import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { PreviewContent } from "./PreviewContent";
import { shouldSeekSecondaryMedia } from "./playback-sync";
import type { PreviewQuality } from "./preview-quality";
import type {
  ClipTransitionType,
  EditorMediaItem,
  TimelineMediaClip
} from "./types";

type TransitionRole = "outgoing" | "incoming";

/**
 * Both sides of a transition stay mounted with fixed roles for the whole
 * window. The old implementation swapped the two video elements at the cut,
 * which reloaded both decoders exactly at the midpoint and looked like a jerk.
 */
export function PreviewTransitionLayer(props: {
  from: TimelineMediaClip;
  to: TimelineMediaClip;
  type: ClipTransitionType;
  progress: number;
  currentTime: number;
  playing: boolean;
  cameraItem: EditorMediaItem | null;
  screenStyle: CSSProperties;
  screenContentStyle?: CSSProperties;
  cameraMaskUrl?: string | null;
  cameraStyle: CSSProperties | null;
  cameraVideoStyle: CSSProperties;
  previewQuality: PreviewQuality;
  /** Fade-through-black needs a solid black backdrop; other transitions must
   * composite over the frame's Style background instead. */
  opaqueBackdrop: boolean;
}) {
  const fromVideoRef = useRef<HTMLVideoElement | null>(null);
  const fromCameraRef = useRef<HTMLVideoElement | null>(null);
  const toVideoRef = useRef<HTMLVideoElement | null>(null);
  const toCameraRef = useRef<HTMLVideoElement | null>(null);
  const clipKeysRef = useRef<Record<string, string>>({});
  const lastSeekAtRef = useRef<Record<string, number>>({});

  function syncSide(
    element: HTMLMediaElement,
    clip: TimelineMediaClip,
    key: string
  ) {
    const clipChanged = clipKeysRef.current[key] !== clip.id;
    clipKeysRef.current[key] = clip.id;
    const offset = Math.max(0, Math.min(clip.duration, props.currentTime - clip.start));
    const mediaTime = clip.sourceStart + offset;
    const shouldSeek = shouldSeekSecondaryMedia({
      reason: clipChanged ? "clip-change" : "tick",
      isPlaying: props.playing,
      clipChanged,
      canSeek:
        element.readyState >= HTMLMediaElement.HAVE_METADATA && !element.seeking,
      currentMediaTime: element.currentTime,
      desiredMediaTime: mediaTime,
      nowMs: performance.now(),
      lastSeekAtMs: lastSeekAtRef.current[key] ?? null
    });
    if (shouldSeek) {
      try {
        const safeTime = Number.isFinite(element.duration)
          ? Math.min(mediaTime, Math.max(0, element.duration - 1 / 30))
          : mediaTime;
        if (Math.abs(element.currentTime - safeTime) > 0.02) {
          element.currentTime = safeTime;
          lastSeekAtRef.current[key] = performance.now();
        }
      } catch {
        // Metadata can change while a dragged transition swaps its source.
      }
    }
    if (props.playing && element.paused && !element.ended) {
      void element.play().catch(() => undefined);
    } else if (!props.playing && !element.paused) {
      element.pause();
    }
  }

  useEffect(() => {
    for (const [key, clip, video, camera] of [
      ["from", props.from, fromVideoRef.current, fromCameraRef.current],
      ["to", props.to, toVideoRef.current, toCameraRef.current]
    ] as const) {
      if (video) syncSide(video, clip, key);
      if (camera) syncSide(camera, clip, `${key}-camera`);
    }
    // The clip identities and playhead time fully describe the desired frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.from.id, props.to.id, props.currentTime, props.playing]);

  useEffect(() => () => {
    for (const element of [fromVideoRef.current, fromCameraRef.current, toVideoRef.current, toCameraRef.current]) {
      element?.pause();
    }
  }, []);

  const renderSide = (clip: TimelineMediaClip, role: TransitionRole, videoRef: typeof fromVideoRef, cameraRef: typeof fromCameraRef) => (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${props.opaqueBackdrop ? "bg-black" : ""}`}
      style={{ ...getPreviewTransitionLayerStyle(props.type, props.progress, role), willChange: "opacity, transform", contain: "paint" }}
      data-transition-side={role}
      aria-hidden="true"
    >
      <PreviewContent
        item={clip.item}
        cameraItem={props.cameraItem}
        showNoCameraRecording={false}
        screenStyle={props.screenStyle}
        screenContentStyle={props.screenContentStyle}
        cameraMaskUrl={props.cameraMaskUrl}
        cameraStyle={props.cameraStyle}
        cameraVideoStyle={props.cameraVideoStyle}
        screenEditEnabled={false}
        cameraEditEnabled={false}
        activeSubtitle={null}
        subtitleStyle="clean"
        currentTime={props.currentTime}
        previewQuality={props.previewQuality}
        mainVideoRef={videoRef}
        cameraRef={cameraRef}
        onScreenEditPointerDown={() => undefined}
        onCameraEditPointerDown={() => undefined}
        onMediaReady={() => undefined}
        onDuration={() => undefined}
        onSubtitleClick={() => undefined}
      />
    </div>
  );

  return (
    <>
      {renderSide(props.from, "outgoing", fromVideoRef, fromCameraRef)}
      {renderSide(props.to, "incoming", toVideoRef, toCameraRef)}
    </>
  );
}

export function getPreviewTransitionLayerStyle(
  type: ClipTransitionType,
  progress: number,
  role: TransitionRole
): CSSProperties {
  const value = Math.max(0, Math.min(1, progress));
  const incoming = role === "incoming";
  const style: CSSProperties = { zIndex: incoming ? 2 : 1 };

  if (type === "crossfade") {
    // Keep the outgoing frame opaque underneath; alpha-composite the incoming
    // frame over it so the midpoint does not dim toward the canvas background.
    style.opacity = incoming ? value : 1;
  } else if (type === "fade-black") {
    style.opacity = incoming
      ? Math.max(0, value * 2 - 1)
      : Math.max(0, 1 - value * 2);
  } else if (type === "slide-left") {
    style.transform = incoming
      ? `translateX(${(1 - value) * 100}%)`
      : `translateX(${-value * 100}%)`;
  } else if (type === "wipe-left" && incoming) {
    style.clipPath = `inset(0 0 0 ${(1 - value) * 100}%)`;
  }

  return style;
}
