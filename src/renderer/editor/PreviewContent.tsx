/**
 * Renders whatever the playhead is over inside the preview frame: image,
 * project composition (screen + camera bubble), or plain video, plus the
 * subtitle overlay and layout-edit handles.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { PreviewVideo } from "./PreviewVideo";
import type { PreviewQuality } from "./preview-quality";
import { clampNumber } from "./utils";
import type {
  EditorMediaItem,
  LayoutMode,
  ScreenLayoutDragMode,
  SubtitleSegment,
  SubtitleStyle,
  SubtitleWord
} from "./types";

const screenResizeModes = ["resize-nw", "resize-ne", "resize-sw", "resize-se"] as const;

const mediaFrameClassName =
  "absolute inset-0 size-full border-0 bg-transparent transition-[transform] duration-[45ms] ease-[cubic-bezier(0.2,0,0.2,1)] will-change-transform";

const editOverlayClassName =
  "group absolute z-[3] box-border cursor-grab touch-none border border-transparent bg-transparent shadow-none transition-[border-color,background-color,box-shadow] hover:border-amber-300/90 hover:bg-emerald-500/10 hover:shadow-[0_0_0_1px_rgb(2_6_23_/_0.35),0_14px_34px_rgb(8_47_73_/_0.2)] active:cursor-grabbing";

const handleBaseClassName =
  "absolute z-[1] size-3 rounded-full border-2 border-white bg-amber-300 opacity-0 shadow-[0_0_0_1px_rgb(8_47_73_/_0.65),0_8px_18px_rgb(2_6_23_/_0.35)] transition-opacity group-hover:opacity-100";

const handleClassByMode: Record<ScreenLayoutDragMode, string> = {
  move: "",
  "resize-nw": "-left-1.5 -top-1.5 cursor-nwse-resize",
  "resize-ne": "-right-1.5 -top-1.5 cursor-nesw-resize",
  "resize-sw": "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  "resize-se": "-bottom-1.5 -right-1.5 cursor-nwse-resize"
};

/**
 * Renders whatever the playhead is currently over inside the preview frame:
 * - an image asset,
 * - the project composition (screen video + optional camera bubble), or
 * - a plain imported video.
 *
 * Layout positioning is passed in via React styles so the component can stay
 * Tailwind-only while still supporting freeform screen/camera dragging.
 */
export function PreviewContent(props: {
  item: EditorMediaItem;
  isProjectCompositionSelected: boolean;
  projectCamera: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  cameraStyle: CSSProperties | null;
  cameraVideoStyle: CSSProperties;
  screenEditEnabled: boolean;
  cameraEditEnabled: boolean;
  activeSubtitle: SubtitleSegment | null;
  subtitleStyle: SubtitleStyle;
  currentTime: number;
  previewQuality: PreviewQuality;
  mainVideoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  onScreenEditPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) => void;
  onCameraEditPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) => void;
  onMediaReady: () => void;
  onDuration: (duration: number | null) => void;
  onSubtitleClick: (subtitleId: string) => void;
}) {
  if (props.item.kind === "image") {
    return (
      <>
        <img className={mediaFrameClassName} style={props.screenStyle} src={props.item.url} alt="" />
        <ScreenEditOverlay
          enabled={props.screenEditEnabled}
          style={props.screenStyle}
          onPointerDown={props.onScreenEditPointerDown}
        />
        <SubtitleOverlay
          subtitle={props.activeSubtitle}
          currentTime={props.currentTime}
          style={props.subtitleStyle}
          onClick={props.onSubtitleClick}
        />
      </>
    );
  }

  if (props.isProjectCompositionSelected) {
    const showScreen = props.layoutMode !== "camera-only";
    const showCamera = Boolean(props.projectCamera && props.layoutMode !== "screen-only");

    return (
      <>
        {showScreen ? (
          <>
            <PreviewVideo
              videoRef={props.mainVideoRef}
              quality={props.previewQuality}
              className={mediaFrameClassName}
              style={props.screenStyle}
              src={props.item.url}
              // ovc-media:// / ovc-import:// are cross-origin to the page; without
              // this the WebAudio meter graph (audio-meter.ts) is CORS-tainted and
              // outputs silence. The protocol handlers send Access-Control-Allow-Origin: *.
              crossOrigin="anonymous"
              playsInline
              muted
              onCanPlay={props.onMediaReady}
              onLoadedMetadata={(event) => {
                props.onDuration(event.currentTarget.duration);
                props.onMediaReady();
              }}
            />
            <ScreenEditOverlay
              enabled={props.screenEditEnabled}
              style={props.screenStyle}
              onPointerDown={props.onScreenEditPointerDown}
            />
          </>
        ) : null}
        {showCamera && props.projectCamera ? (
          <>
            <div className={mediaFrameClassName} style={props.cameraStyle ?? undefined}>
              <PreviewVideo
                videoRef={props.cameraRef}
                quality={props.previewQuality}
                className="absolute inset-0 size-full border-0 bg-transparent"
                style={props.cameraVideoStyle}
                src={props.projectCamera.url}
                crossOrigin="anonymous"
                playsInline
                muted
                onCanPlay={props.onMediaReady}
              />
            </div>
            <CameraEditOverlay
              enabled={props.cameraEditEnabled}
              style={props.cameraStyle}
              onPointerDown={props.onCameraEditPointerDown}
            />
          </>
        ) : null}
        {props.layoutMode === "camera-only" && !props.projectCamera ? (
          <div className="grid size-full place-items-center text-sm font-bold text-slate-400">
            No camera recording for this project.
          </div>
        ) : null}
        <SubtitleOverlay
          subtitle={props.activeSubtitle}
          currentTime={props.currentTime}
          style={props.subtitleStyle}
          onClick={props.onSubtitleClick}
        />
      </>
    );
  }

  return (
    <>
      <PreviewVideo
        videoRef={props.mainVideoRef}
        quality={props.previewQuality}
        className={mediaFrameClassName}
        style={props.screenStyle}
        src={props.item.url}
        crossOrigin="anonymous"
        playsInline
        onCanPlay={props.onMediaReady}
        onLoadedMetadata={(event) => {
          props.onDuration(event.currentTarget.duration);
          props.onMediaReady();
        }}
      />
      <ScreenEditOverlay
        enabled={props.screenEditEnabled}
        style={props.screenStyle}
        onPointerDown={props.onScreenEditPointerDown}
      />
      <SubtitleOverlay
        subtitle={props.activeSubtitle}
        currentTime={props.currentTime}
        style={props.subtitleStyle}
        onClick={props.onSubtitleClick}
      />
    </>
  );
}

/**
 * Transparent overlay matching the screen video's transform. In layout mode it
 * exposes a move surface plus four corner handles that start resize drags.
 */
function ScreenEditOverlay(props: {
  enabled: boolean;
  style: CSSProperties;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) => void;
}) {
  if (!props.enabled) {
    return null;
  }

  return (
    <div
      className={`${mediaFrameClassName} ${editOverlayClassName}`}
      style={props.style}
      aria-hidden="true"
      data-screen-edit-overlay
      onPointerDown={(event) => props.onPointerDown(event, "move")}
    >
      {screenResizeModes.map((mode) => (
        <span
          className={`${handleBaseClassName} ${handleClassByMode[mode]}`}
          key={mode}
          onPointerDown={(event) => props.onPointerDown(event, mode)}
        />
      ))}
    </div>
  );
}

function CameraEditOverlay(props: {
  enabled: boolean;
  style: CSSProperties | null;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    mode: ScreenLayoutDragMode
  ) => void;
}) {
  if (!props.enabled || !props.style) {
    return null;
  }

  const overlayStyle = {
    ...props.style,
    border: undefined,
    overflow: "visible"
  } satisfies CSSProperties;

  return (
    <div
      className={`${editOverlayClassName} z-[5] ${
        props.style.borderRadius === "999px" ? "rounded-full" : ""
      }`}
      style={overlayStyle}
      aria-hidden="true"
      data-camera-edit-overlay
      onPointerDown={(event) => props.onPointerDown(event, "move")}
    >
      {screenResizeModes.map((mode) => (
        <span
          className={`${handleBaseClassName} ${handleClassByMode[mode]}`}
          key={mode}
          onPointerDown={(event) => props.onPointerDown(event, mode)}
        />
      ))}
    </div>
  );
}

/**
 * Renders the subtitle under the playhead. Without word-level timings the
 * words are spread evenly across the subtitle's window and the word under the
 * playhead is highlighted (karaoke/pop styles only).
 */
function SubtitleOverlay(props: {
  subtitle: SubtitleSegment | null;
  currentTime: number;
  style: SubtitleStyle;
  onClick: (subtitleId: string) => void;
}) {
  if (!props.subtitle) {
    return null;
  }

  const words = getSubtitleOverlayWords(props.subtitle);
  const duration = Math.max(0.1, props.subtitle.end - props.subtitle.start);
  const perWord = duration / Math.max(1, words.length);
  const elapsed = props.currentTime - props.subtitle.start;
  const highlights = props.style === "karaoke" || props.style === "pop";
  const activeIndex = highlights
    ? getActiveSubtitleWordIndex(words, props.currentTime, elapsed, perWord)
    : -1;

  return (
    <button
      className={`absolute bottom-[6%] left-1/2 z-[4] max-w-[86%] -translate-x-1/2 cursor-text rounded-lg border-0 px-2 py-1 text-center font-extrabold leading-tight text-white shadow-none [text-shadow:0_2px_8px_rgb(0_0_0_/_0.85)] ${
        props.style === "boxed" ? "bg-black/70 [text-shadow:none]" : "bg-transparent"
      }`}
      type="button"
      onClick={() => props.onClick(props.subtitle?.id ?? "")}
    >
      {words.map((word, index) => (
        <span
          key={`${word.text}-${index}`}
          className={`mx-[0.16em] inline-block rounded transition ${
            index === activeIndex && props.style === "karaoke"
              ? "bg-amber-500 px-[0.16em] text-white"
              : index === activeIndex && props.style === "pop"
                ? "scale-110 text-emerald-400"
                : ""
          }`}
        >
          {word.text}
        </span>
      ))}
    </button>
  );
}

function getSubtitleOverlayWords(subtitle: SubtitleSegment): SubtitleWord[] {
  if (subtitle.words?.length) {
    return subtitle.words;
  }

  const words = subtitle.text.trim().split(/\s+/).filter(Boolean);
  const duration = Math.max(0.1, subtitle.end - subtitle.start);
  const perWord = duration / Math.max(1, words.length);

  return words.map((word, index) => ({
    text: word,
    start: subtitle.start + index * perWord,
    end: subtitle.start + (index + 1) * perWord
  }));
}

function getActiveSubtitleWordIndex(
  words: SubtitleWord[],
  currentTime: number,
  fallbackElapsed: number,
  fallbackPerWord: number
): number {
  const timedIndex = words.findIndex(
    (word) => currentTime >= word.start && currentTime < word.end
  );

  if (timedIndex >= 0) {
    return timedIndex;
  }

  return clampNumber(Math.floor(fallbackElapsed / fallbackPerWord), 0, words.length - 1);
}
