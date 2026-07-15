import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { PreviewContent } from "./PreviewContent";
import type { PreviewQuality } from "./preview-quality";
import type {
  ClipTransitionType,
  EditorMediaItem,
  LayoutMode,
  TimelineMediaClip
} from "./types";

type TransitionRole = "outgoing" | "incoming";

/** The non-primary clip shown during the short preview window around a cut. */
export function PreviewTransitionLayer(props: {
  clip: TimelineMediaClip;
  role: TransitionRole;
  type: ClipTransitionType;
  progress: number;
  currentTime: number;
  playing: boolean;
  projectCamera: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  cameraStyle: CSSProperties | null;
  cameraVideoStyle: CSSProperties;
  previewQuality: PreviewQuality;
  /** Fade-through-black needs a solid black backdrop; other transitions must
   * composite over the frame's Style background instead. */
  opaqueBackdrop: boolean;
}) {
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);

  function syncMediaElements() {
    const offset = Math.max(0, Math.min(props.clip.duration, props.currentTime - props.clip.start));
    const mediaTime = props.clip.sourceStart + offset;
    const elements = [mainVideoRef.current, cameraRef.current].filter(
      (element): element is HTMLVideoElement => Boolean(element)
    );

    for (const element of elements) {
      element.muted = true;
      if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
        const safeTime = Number.isFinite(element.duration)
          ? Math.min(mediaTime, Math.max(0, element.duration - 1 / 30))
          : mediaTime;
        if (Math.abs(element.currentTime - safeTime) > 0.08) {
          try {
            element.currentTime = safeTime;
          } catch {
            // Metadata can change while a dragged transition swaps its source.
          }
        }
      }
      if (props.playing && element.paused && !element.ended) {
        void element.play().catch(() => undefined);
      } else if (!props.playing && !element.paused) {
        element.pause();
      }
    }
  }

  useEffect(() => {
    syncMediaElements();
    // The clip identity and playhead time fully describe the desired frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clip, props.currentTime, props.playing]);

  useEffect(() => () => {
    mainVideoRef.current?.pause();
    cameraRef.current?.pause();
  }, []);

  const item = props.clip.item;
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${props.opaqueBackdrop ? "bg-black" : ""}`}
      style={getPreviewTransitionLayerStyle(props.type, props.progress, props.role)}
      aria-hidden="true"
    >
      <PreviewContent
        item={item}
        isProjectCompositionSelected={item.origin === "project" && item.track === "screen"}
        projectCamera={props.projectCamera}
        layoutMode={props.layoutMode}
        screenStyle={props.screenStyle}
        cameraStyle={props.cameraStyle}
        cameraVideoStyle={props.cameraVideoStyle}
        screenEditEnabled={false}
        cameraEditEnabled={false}
        activeSubtitle={null}
        subtitleStyle="clean"
        currentTime={props.currentTime}
        previewQuality={props.previewQuality}
        mainVideoRef={mainVideoRef}
        cameraRef={cameraRef}
        onScreenEditPointerDown={() => undefined}
        onCameraEditPointerDown={() => undefined}
        onMediaReady={syncMediaElements}
        onDuration={() => undefined}
        onSubtitleClick={() => undefined}
      />
    </div>
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
