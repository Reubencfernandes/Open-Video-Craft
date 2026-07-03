import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { clampNumber } from "./utils";
import type {
  EditorMediaItem,
  LayoutMode,
  ScreenLayoutDragMode,
  SubtitleSegment,
  SubtitleStyle
} from "./types";

const screenResizeModes = ["resize-nw", "resize-ne", "resize-sw", "resize-se"] as const;

/**
 * Renders whatever the playhead is currently over inside the preview frame:
 * - an image asset,
 * - the project composition (screen video + optional camera bubble), or
 * - a plain imported video.
 *
 * The `studio-*` / `preview-*` class names hook into the layout-preset CSS
 * (bubble, side-by-side, presenter, ...) which positions these elements per
 * the selected LayoutMode.
 */
export function PreviewContent(props: {
  item: EditorMediaItem;
  isProjectCompositionSelected: boolean;
  projectCamera: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  screenEditEnabled: boolean;
  activeSubtitle: SubtitleSegment | null;
  subtitleStyle: SubtitleStyle;
  currentTime: number;
  mainVideoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  onScreenEditPointerDown: (
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
        <img className="studio-screen-video" style={props.screenStyle} src={props.item.url} alt="" />
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
            <video
              ref={props.mainVideoRef}
              className="studio-screen-video"
              style={props.screenStyle}
              src={props.item.url}
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
          <video
            ref={props.cameraRef}
            className="studio-camera-video"
            src={props.projectCamera.url}
            playsInline
            muted
            onCanPlay={props.onMediaReady}
          />
        ) : null}
        {props.layoutMode === "camera-only" && !props.projectCamera ? (
          <div className="studio-video-empty">No camera recording for this project.</div>
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
      <video
        ref={props.mainVideoRef}
        className="studio-screen-video"
        style={props.screenStyle}
        src={props.item.url}
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
      className="studio-screen-video studio-screen-edit-overlay"
      style={props.style}
      aria-hidden="true"
      onPointerDown={(event) => props.onPointerDown(event, "move")}
    >
      {screenResizeModes.map((mode) => (
        <span
          className={`studio-screen-edit-handle studio-screen-edit-handle-${mode.replace(
            "resize-",
            ""
          )}`}
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

  const words = props.subtitle.text.trim().split(/\s+/).filter(Boolean);
  const duration = Math.max(0.1, props.subtitle.end - props.subtitle.start);
  const perWord = duration / Math.max(1, words.length);
  const elapsed = props.currentTime - props.subtitle.start;
  const highlights = props.style === "karaoke" || props.style === "pop";
  const activeIndex = highlights
    ? clampNumber(Math.floor(elapsed / perWord), 0, words.length - 1)
    : -1;

  return (
    <button
      className={`subtitle-overlay subtitle-style-${props.style}`}
      type="button"
      onClick={() => props.onClick(props.subtitle?.id ?? "")}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={`subtitle-word ${index === activeIndex ? "subtitle-word-active" : ""}`}
        >
          {word}
        </span>
      ))}
    </button>
  );
}
