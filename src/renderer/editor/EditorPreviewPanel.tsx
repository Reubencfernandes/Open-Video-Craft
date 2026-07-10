import type {
  CSSProperties,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { PreviewContent } from "./PreviewContent";
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
    <section className="relative min-h-0 min-w-0 overflow-hidden bg-transparent">
      <div className="flex size-full items-center justify-center overflow-auto px-3 pb-12 pt-3">
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
            <div className="grid size-full place-items-center text-sm font-bold text-slate-400">
              Import media or record a screen.
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute bottom-4 right-5 z-[8] inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#080a0e]/80 p-1 shadow-[0_14px_34px_rgb(0_0_0_/_0.34)] backdrop-blur"
        aria-label="Preview zoom controls"
      >
        <button
          className="grid size-8 place-items-center rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
          type="button"
          title="Zoom preview out"
          aria-label="Zoom preview out"
          onClick={() => props.onPreviewZoomChange(props.previewZoom - 0.1)}
        >
          <ZoomOut size={16} />
        </button>
        <span className="min-w-12 text-center text-xs font-extrabold text-slate-200 tabular-nums">
          {Math.round(props.previewZoom * 100)}%
        </span>
        <button
          className="grid size-8 place-items-center rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
          type="button"
          title="Zoom preview in"
          aria-label="Zoom preview in"
          onClick={() => props.onPreviewZoomChange(props.previewZoom + 0.1)}
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="grid size-8 place-items-center rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
          type="button"
          title="Reset preview zoom"
          aria-label="Reset preview zoom"
          onClick={() => props.onPreviewZoomChange(1)}
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="hidden" aria-hidden="true">
        {props.audioTimelineClips.map((clip) => (
          <audio
            key={clip.id}
            src={clip.item.url}
            preload="metadata"
            // Opt into CORS so the Web Audio graph (boost + meter) stays audible
            // for custom-protocol media instead of outputting silence.
            crossOrigin="anonymous"
            onLoadedMetadata={(event) =>
              props.onMediaDuration(clip.item.id, event.currentTarget.duration)
            }
            ref={(element) => {
              if (element) {
                props.audioElsRef.current.set(clip.id, element);
              } else {
                props.audioElsRef.current.delete(clip.id);
              }
            }}
          />
        ))}
      </div>
    </section>
  );
}
