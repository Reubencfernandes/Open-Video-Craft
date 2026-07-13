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
import { PreviewTransportBar } from "./PreviewTransportBar";
import { TimelineAudioElements } from "./TimelineAudioElements";
import type {
  EditorMediaItem,
  LayoutMode,
  ScreenLayoutDragMode,
  SubtitleSegment,
  SubtitleStyle,
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
  activeSubtitle: SubtitleSegment | null;
  subtitleStyle: SubtitleStyle;
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
}) {
  const previewItem = props.previewItem;
  const previewFrameStyle = {
    ...props.previewFrameStyle,
    "--preview-zoom": props.previewZoom
  } as CSSProperties;

  return (
    <section className="order-3 relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#111214] shadow-[0_18px_45px_rgb(0_0_0_/_0.2)]">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-5">
        <div className={props.previewClassName} style={previewFrameStyle}>
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
        </div>
      </div>

      <PreviewTransportBar playing={props.playing} currentFrame={props.currentFrame} totalFrames={props.totalFrames} onTogglePlayback={props.onTogglePlayback} onSeekFrame={props.onSeekFrame} />
      <TimelineAudioElements clips={props.audioTimelineClips} elementsRef={props.audioElsRef} onMediaDuration={props.onMediaDuration} />
    </section>
  );
}
