import { AudioLines, Captions, Film, WandSparkles } from "lucide-react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { cx } from "../classNames";
import { getOrderedZoomTimingItems } from "../zoom-timing";
import {
  TimelineContextMenuView,
  TimelinePlayhead,
  TimelineRuler,
  TimelineToolbar
} from "./TimelineChrome";
import { TimelineClip, TimelineSubtitleClip, TimelineZoomClip } from "./TimelineClips";
import { TimelineTrack } from "./TimelineTrack";
import type {
  EditorTool,
  SubtitleSegment,
  TimelineContextMenu,
  TimelineMediaClip,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

/**
 * The bottom timeline panel: transport toolbar, ruler, playhead and the track
 * lanes (video, plus zoom/audio/subtitles depending on the active tool).
 *
 * This is a purely presentational assembly — all pointer/drag/drop state lives
 * in EditorView, which passes its handlers through. The `--timeline-*` CSS
 * variables declared here size the label column for every child (tracks,
 * ruler offset and the playhead position math all read them).
 */
export function Timeline(props: {
  bodyRef: RefObject<HTMLDivElement | null>;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeDoubleClick: () => void;
  activeTool: EditorTool;
  playing: boolean;
  scrubbing: boolean;
  currentTime: number;
  currentFrame: number;
  totalFrames: number;
  playheadPercent: number;
  /** Rendered scale (never shrinks when clips are trimmed/deleted). */
  renderDuration: number;
  videoClips: TimelineMediaClip[];
  audioTracks: Array<{ lane: number; clips: TimelineMediaClip[] }>;
  zoomEffects: ZoomEffect[];
  subtitles: SubtitleSegment[];
  selectedSegmentId: string | null;
  selectedZoomId: string | null;
  selectedSubtitleId: string | null;
  contextMenu: TimelineContextMenu;
  canSplitAtContextMenu: boolean;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
  onSelectClip: (clip: TimelineMediaClip) => void;
  onSelectZoom: (effect: ZoomEffect) => void;
  onSelectSubtitle: (subtitleId: string) => void;
  onTrimPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
    edge: TimelineTrimEdge
  ) => void;
  onMovePointerDown: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
  onZoomDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
  onBodyPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBodyPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBodyPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBodyContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onBodyDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onBodyDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onContextMenuSplit: () => void;
  onContextMenuDelete: () => void;
}) {
  return (
    <section className="relative grid h-full min-h-0 min-w-0 content-start gap-[0.45rem] overflow-auto border-t border-white/[0.08] bg-[#141518] px-[1.1rem] pb-4 pt-4 [--timeline-body-pad:0.7rem] [--timeline-label-width:132px] [--timeline-track-gap:0.85rem]">
      <button
        className="group absolute left-0 right-0 top-0 z-30 grid h-7 cursor-row-resize place-items-center border-0 bg-transparent p-0"
        type="button"
        aria-label="Resize timeline"
        title="Drag to resize timeline"
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onPointerUp={props.onResizePointerUp}
        onPointerCancel={props.onResizePointerUp}
        onDoubleClick={props.onResizeDoubleClick}
      >
        <span className="h-1.5 w-20 rounded-full bg-cyan-300/80 shadow-[0_0_18px_rgb(34_211_238_/_0.35)] transition group-hover:bg-cyan-200" />
      </button>

      <TimelineToolbar
        playing={props.playing}
        currentFrame={props.currentFrame}
        totalFrames={props.totalFrames}
        currentTime={props.currentTime}
        playheadPercent={props.playheadPercent}
        onTogglePlayback={props.onTogglePlayback}
        onSeekFrame={props.onSeekFrame}
      />

      <TimelineRuler duration={props.renderDuration} />

      {/* The body owns scrubbing, clip move/trim drags and asset drag & drop.
          touch-none keeps pointer capture stable during drags. */}
      <div
        className={cx(
          "relative grid min-h-[12.3rem] cursor-pointer select-none content-start gap-1.5 overflow-visible px-[var(--timeline-body-pad)] pb-3 pt-2.5 touch-none",
          props.scrubbing && "cursor-ew-resize"
        )}
        ref={props.bodyRef}
        onPointerDown={props.onBodyPointerDown}
        onPointerMove={props.onBodyPointerMove}
        onPointerUp={props.onBodyPointerUp}
        onPointerCancel={props.onBodyPointerUp}
        onContextMenu={props.onBodyContextMenu}
        onDragOver={props.onBodyDragOver}
        onDrop={props.onBodyDrop}
      >
        <TimelinePlayhead playheadPercent={props.playheadPercent} />

        <TimelineTrack label="Video 1" accent="purple" icon={<Film size={14} />}>
          {props.videoClips.map((clip) => (
            <TimelineClip
              key={clip.id}
              clip={clip}
              timelineDuration={props.renderDuration}
              selected={props.selectedSegmentId === clip.id}
              onSelect={() => props.onSelectClip(clip)}
              onTrimPointerDown={props.onTrimPointerDown}
              onMovePointerDown={props.onMovePointerDown}
            />
          ))}
        </TimelineTrack>

        {props.activeTool === "zoom" ? (
          <TimelineTrack label="Zoom" accent="amber" icon={<WandSparkles size={14} />}>
            {getOrderedZoomTimingItems(props.zoomEffects).map((effect) => (
              <TimelineZoomClip
                key={effect.id}
                effect={effect}
                duration={props.renderDuration}
                selected={props.selectedZoomId === effect.id}
                onSelect={() => props.onSelectZoom(effect)}
                onDragPointerDown={props.onZoomDragPointerDown}
              />
            ))}
          </TimelineTrack>
        ) : null}

        {props.activeTool === "audio"
          ? props.audioTracks.map((track) => (
              <TimelineTrack
                key={track.lane}
                label={`Audio ${track.lane + 1}`}
                accent="green"
                icon={<AudioLines size={14} />}
              >
                {track.clips.map((clip) => (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    timelineDuration={props.renderDuration}
                    selected={props.selectedSegmentId === clip.id}
                    onSelect={() => props.onSelectClip(clip)}
                    onTrimPointerDown={props.onTrimPointerDown}
                    onMovePointerDown={props.onMovePointerDown}
                  />
                ))}
              </TimelineTrack>
            ))
          : null}

        {props.activeTool === "subtitles" ? (
          <TimelineTrack label="Subtitles" accent="cyan" icon={<Captions size={14} />}>
            {props.subtitles.map((subtitle) => (
              <TimelineSubtitleClip
                key={subtitle.id}
                subtitle={subtitle}
                duration={props.renderDuration}
                selected={props.selectedSubtitleId === subtitle.id}
                onSelect={() => props.onSelectSubtitle(subtitle.id)}
              />
            ))}
          </TimelineTrack>
        ) : null}
      </div>

      {props.contextMenu ? (
        <TimelineContextMenuView
          x={props.contextMenu.x}
          y={props.contextMenu.y}
          canSplit={props.canSplitAtContextMenu}
          canDelete={Boolean(props.contextMenu.segmentId)}
          onSplit={props.onContextMenuSplit}
          onDelete={props.onContextMenuDelete}
        />
      ) : null}
    </section>
  );
}
