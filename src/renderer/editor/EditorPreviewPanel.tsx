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
import { AudioLines, Share } from "lucide-react";
import { PreviewContent } from "./PreviewContent";
import { PreviewLayoutGrid } from "./PreviewLayoutGrid";
import { PreviewQualityControl } from "./PreviewQualityControl";
import {
  getPreviewTransitionLayerStyle,
  PreviewTransitionLayer
} from "./PreviewTransitionLayer";
import { PreviewTransportBar } from "./PreviewTransportBar";
import { TimelineAudioElements } from "./TimelineAudioElements";
import { TextOverlayLayer } from "./TextOverlayLayer";
import { usePreviewQuality } from "./usePreviewQuality";
import { useElementFullscreen } from "./useElementFullscreen";
import { getActiveTimelineTransition } from "./transition-utils";
import type { ViewportSnapOverlay } from "./layout-snapping";
import type {
  EditorMediaItem,
  ClipTransition,
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
  transitions: ClipTransition[];
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
  renderDuration: number;
  masterVolume: number;
  onMasterVolumeChange: (volume: number) => void;
  onOpenAudioTool: () => void;
  onOpenExport: () => void;
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
  const activeTransition = getActiveTimelineTransition(
    props.videoTimelineClips,
    props.transitions,
    props.currentTime
  );
  const primaryRole = activeTransition
    ? props.currentTime < activeTransition.cutTime ? "outgoing" : "incoming"
    : null;
  const secondaryClip = activeTransition
    ? primaryRole === "outgoing" ? activeTransition.to : activeTransition.from
    : null;
  const previewFrameStyle = {
    ...props.previewFrameStyle,
    "--preview-zoom": props.previewZoom
  } as CSSProperties;

  return (
    <section
      className="editor-preview order-3 relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#0b0b0d]"
      ref={previewPanelRef}
    >
      <div className="editor-preview-header flex h-11 flex-none items-center justify-between gap-2 px-3">
        <PreviewQualityControl quality={previewQuality} onChange={setPreviewQuality} />
        <div className="inline-flex items-center gap-1">
          <button
            className="grid size-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/[0.08] hover:text-white"
            type="button"
            title="Audio mixer"
            onClick={props.onOpenAudioTool}
          >
            <AudioLines size={16} />
          </button>
          <button
            className="grid size-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/[0.08] hover:text-white"
            type="button"
            title="Export video"
            onClick={props.onOpenExport}
          >
            <Share size={15} />
          </button>
        </div>
      </div>

      <div className="editor-preview-stage flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto bg-black p-4">
        <div className={`editor-preview-frame ${props.previewClassName}`} style={previewFrameStyle}>
          {activeTransition ? (
            <span className="pointer-events-none absolute inset-0 z-0 bg-black" aria-hidden="true" />
          ) : null}
          {/* bg-black only while a transition is compositing: outside of one,
              the frame's Style background must stay visible around the video. */}
          {previewItem ? (
            <div
              className={`absolute inset-0 overflow-hidden ${activeTransition ? "bg-black" : ""}`}
              style={activeTransition && primaryRole
                ? getPreviewTransitionLayerStyle(
                    activeTransition.transition.type,
                    activeTransition.progress,
                    primaryRole
                  )
                : { zIndex: 1 }}
            >
              <PreviewContent
                item={previewItem}
                isProjectCompositionSelected={props.isProjectCompositionSelected}
                projectCamera={props.projectCamera}
                layoutMode={props.layoutMode}
                screenStyle={props.screenStyle}
                cameraStyle={props.cameraStyle}
                cameraVideoStyle={props.cameraVideoStyle}
                screenEditEnabled={props.screenEditEnabled && !activeTransition}
                cameraEditEnabled={props.cameraEditEnabled && !activeTransition}
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
            </div>
          ) : props.videoTimelineClips.length > 0 ? null : (
            <div className="grid size-full place-items-center">
              <span className="rounded-full bg-black/45 px-4 py-2 text-sm font-bold text-slate-200">
                Import media or record a screen.
              </span>
            </div>
          )}
          {activeTransition && secondaryClip && primaryRole ? (
            <PreviewTransitionLayer
              clip={secondaryClip}
              role={primaryRole === "outgoing" ? "incoming" : "outgoing"}
              type={activeTransition.transition.type}
              progress={activeTransition.progress}
              currentTime={props.currentTime}
              playing={props.playing}
              projectCamera={props.projectCamera}
              layoutMode={props.layoutMode}
              screenStyle={props.screenStyle}
              cameraStyle={props.cameraStyle}
              cameraVideoStyle={props.cameraVideoStyle}
              previewQuality={previewQuality}
            />
          ) : null}
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
        currentTime={props.currentTime}
        renderDuration={props.renderDuration}
        masterVolume={props.masterVolume}
        fullscreen={previewFullscreen}
        onMasterVolumeChange={props.onMasterVolumeChange}
        onTogglePlayback={props.onTogglePlayback}
        onToggleFullscreen={() => void togglePreviewFullscreen()}
        onSeekFrame={props.onSeekFrame}
      />
      <TimelineAudioElements clips={props.audioTimelineClips} elementsRef={props.audioElsRef} onMediaDuration={props.onMediaDuration} />
    </section>
  );
}
