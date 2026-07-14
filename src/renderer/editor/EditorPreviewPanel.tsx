/**
 * Preview shell: the framed preview area, the transport bar (skip / step /
 * play), and the hidden audio elements that play timeline audio clips.
 */
import type {
  CSSProperties,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { PreviewContent } from "./PreviewContent";
import { PreviewLayoutGrid } from "./PreviewLayoutGrid";
import { PreviewQualityControl } from "./PreviewQualityControl";
import { PreviewTransportBar } from "./PreviewTransportBar";
import { TimelineAudioElements } from "./TimelineAudioElements";
import { TextOverlayLayer } from "./TextOverlayLayer";
import { usePreviewQuality } from "./usePreviewQuality";
import { useElementFullscreen } from "./useElementFullscreen";
import type { ViewportSnapOverlay } from "./layout-snapping";
import type {
  EditorMediaItem,
  LayoutMode,
  ScreenLayoutDragMode,
  SubtitleSegment,
  SubtitleStyle,
  TextOverlay,
  TimelineMediaClip
} from "./types";

export function EditorPreviewPanel(props: {
  previewClassName: string;
  previewFrameStyle: CSSProperties;
  previewZoom: number;
  previewItem: EditorMediaItem | null;
  videoTimelineClips: TimelineMediaClip[];
  audioTimelineClips: TimelineMediaClip[];
  isProjectCompositionSelected: boolean;
  projectCamera: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  cameraStyle: CSSProperties | null;
  cameraVideoStyle: CSSProperties;
  screenEditEnabled: boolean;
  cameraEditEnabled: boolean;
  snapOverlay: ViewportSnapOverlay;
  activeSubtitle: SubtitleSegment | null;
  subtitleStyle: SubtitleStyle;
  textOverlays: TextOverlay[];
  selectedTextOverlayId: string | null;
  currentTime: number;
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
  mainVideoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  audioElsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
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
  onMediaDuration: (itemId: string, duration: number | null) => void;
  onPreviewZoomChange: (zoom: number) => void;
  onSubtitleClick: (subtitleId: string) => void;
  onTextOverlayClick: (textOverlayId: string) => void;
  onTextOverlayMove: (textOverlayId: string, x: number, y: number) => void;
}) {
  const { quality: previewQuality, setQuality: setPreviewQuality } = usePreviewQuality();
  const {
    elementRef: previewPanelRef,
    fullscreen: previewFullscreen,
    toggleFullscreen: togglePreviewFullscreen
  } = useElementFullscreen<HTMLElement>();
  const previewItem = props.previewItem;
  const previewFrameStyle = {
    ...props.previewFrameStyle,
    "--preview-zoom": props.previewZoom
  } as CSSProperties;

  return (
    <section
      className="editor-preview order-3 relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#11151b]"
      ref={previewPanelRef}
    >
      <div className="editor-preview-stage flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_50%_42%,#202630_0%,#141820_48%,#0e1116_100%)] p-5">
        <div className={`editor-preview-frame ${props.previewClassName}`} style={previewFrameStyle}>
          {previewItem ? (
            <PreviewContent
              item={previewItem}
              isProjectCompositionSelected={props.isProjectCompositionSelected}
              projectCamera={props.projectCamera}
              layoutMode={props.layoutMode}
              screenStyle={props.screenStyle}
              cameraStyle={props.cameraStyle}
              cameraVideoStyle={props.cameraVideoStyle}
              screenEditEnabled={props.screenEditEnabled}
              cameraEditEnabled={props.cameraEditEnabled}
              activeSubtitle={props.activeSubtitle}
              subtitleStyle={props.subtitleStyle}
              currentTime={props.currentTime}
              previewQuality={previewQuality}
              mainVideoRef={props.mainVideoRef}
              cameraRef={props.cameraRef}
              onScreenEditPointerDown={props.onScreenEditPointerDown}
              onCameraEditPointerDown={props.onCameraEditPointerDown}
              onMediaReady={props.onMediaReady}
              onDuration={(nextDuration) => {
                props.onDuration(nextDuration);
                props.onMediaDuration(previewItem.id, nextDuration);
              }}
              onSubtitleClick={props.onSubtitleClick}
            />
          ) : props.videoTimelineClips.length > 0 ? null : (
            <div className="grid size-full place-items-center">
              <span className="rounded-full bg-black/45 px-4 py-2 text-sm font-bold text-slate-200">
                Import media or record a screen.
              </span>
            </div>
          )}
          <TextOverlayLayer
            overlays={props.textOverlays}
            currentTime={props.currentTime}
            selectedId={props.selectedTextOverlayId}
            onSelect={props.onTextOverlayClick}
            onMove={props.onTextOverlayMove}
          />
          <PreviewLayoutGrid overlay={props.snapOverlay} />
        </div>
      </div>

      <PreviewTransportBar
        playing={props.playing}
        currentFrame={props.currentFrame}
        totalFrames={props.totalFrames}
        fullscreen={previewFullscreen}
        transportAccessory={(
          <PreviewQualityControl
            quality={previewQuality}
            onChange={setPreviewQuality}
          />
        )}
        onTogglePlayback={props.onTogglePlayback}
        onToggleFullscreen={() => void togglePreviewFullscreen()}
        onSeekFrame={props.onSeekFrame}
      />
      <TimelineAudioElements clips={props.audioTimelineClips} elementsRef={props.audioElsRef} onMediaDuration={props.onMediaDuration} />
    </section>
  );
}
