/**
 * The bottom timeline panel: transport toolbar, horizontal zoom, ruler,
 * playhead, and the track lanes. Purely presentational; all interaction state
 * lives in EditorView's hooks.
 */
import { AudioLines, Captions, Film, Type, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  TimelineClip,
  TimelineSpeedClip,
  TimelineSubtitleClip,
  TimelineTextClip,
  TimelineTransitionDropTarget,
  TimelineTransitionMarker,
  TimelineZoomClip
} from "./TimelineClips";
import { TimelineTrack } from "./TimelineTrack";
import { SpeedIcon } from "./SpeedIcon";
import {
  getMaxTransitionDuration,
  getNearestTransitionBoundary,
  getTimelineTransitionBoundaries,
  isClipTransitionType
} from "./transition-utils";
import type {
  EditorTool,
  ClipTransition,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineContextMenu,
  TimelineMediaClip,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";
import { transitionDragType } from "./types";

/**
 * The bottom timeline panel: transport toolbar, ruler, playhead and the track
 * lanes. Zoom, speed, and subtitles stay mounted for every tool so their
 * timing is always visible against the same ruler, media clips, and playhead.
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
  timelineZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
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
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  transitions: ClipTransition[];
  subtitles: SubtitleSegment[];
  textOverlays: TextOverlay[];
  selectedSegmentId: string | null;
  selectedZoomId: string | null;
  selectedSpeedId: string | null;
  selectedSubtitleId: string | null;
  selectedTextOverlayId: string | null;
  contextMenu: TimelineContextMenu;
  canSplitAtContextMenu: boolean;
  canSplitAtPlayhead: boolean;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplitAtPlayhead: () => void;
  onDeleteSelected: () => void;
  onSelectClip: (clip: TimelineMediaClip) => void;
  onSelectZoom: (effect: ZoomEffect) => void;
  onSelectSpeed: (effect: SpeedEffect) => void;
  onSelectTransition: (transition: ClipTransition) => void;
  onDropTransition: (transition: Omit<ClipTransition, "id">) => void;
  onSelectSubtitle: (subtitleId: string) => void;
  onSelectTextOverlay: (overlay: TextOverlay) => void;
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
  onSpeedDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
  onSubtitleDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
  onTextOverlayDragPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "move" | "start" | "end"
  ) => void;
  onBodyPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onBodyPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onBodyPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onBodyContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onBodyDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onBodyDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onContextMenuSplit: () => void;
  onContextMenuDelete: () => void;
}) {
  const transitionBoundaries = useMemo(
    () => getTimelineTransitionBoundaries(props.videoClips),
    [props.videoClips]
  );
  const [transitionDropKey, setTransitionDropKey] = useState<string | null>(null);

  function getTransitionBoundaryAtClientX(clientX: number) {
    const lane = props.bodyRef.current?.querySelector<HTMLElement>(".track-lane");
    if (!lane || lane.clientWidth <= 0) return null;
    const bounds = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return getNearestTransitionBoundary(transitionBoundaries, ratio * props.renderDuration);
  }

  function handleBodyDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(transitionDragType)) {
      props.onBodyDragOver(event);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setTransitionDropKey(getTransitionBoundaryAtClientX(event.clientX)?.key ?? null);
  }

  function handleBodyDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(transitionDragType)) {
      props.onBodyDrop(event);
      return;
    }
    event.preventDefault();
    const type = event.dataTransfer.getData(transitionDragType);
    const boundary = getTransitionBoundaryAtClientX(event.clientX);
    setTransitionDropKey(null);
    if (!boundary || !isClipTransitionType(type)) return;
    const existing = props.transitions.find((transition) =>
      transition.fromSegmentId === boundary.from.id &&
      transition.toSegmentId === boundary.to.id
    );
    props.onDropTransition({
      fromSegmentId: boundary.from.id,
      toSegmentId: boundary.to.id,
      type,
      duration: Math.min(existing?.duration ?? 0.6, getMaxTransitionDuration(boundary))
    });
  }

  return (
    <section className="editor-timeline relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-t border-white/[0.06] bg-[#0b0b0d] px-2 pt-2 [--timeline-body-pad:0.25rem] [--timeline-label-width:140px] [--timeline-track-gap:0.4rem]">
      <button
        className="group absolute left-0 right-0 top-0 z-30 grid h-4 cursor-row-resize place-items-center border-0 bg-transparent p-0"
        type="button"
        aria-label="Resize timeline"
        title="Drag to resize timeline"
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onPointerUp={props.onResizePointerUp}
        onPointerCancel={props.onResizePointerUp}
        onDoubleClick={props.onResizeDoubleClick}
      >
        <span className="h-px w-24 bg-white/[0.15] transition group-hover:bg-white/60" />
      </button>

      {/* Horizontal-zoom viewport: the ruler and track body grow past 100% and
          scroll together so the time axis can be zoomed in like a real NLE. */}
      <div className="min-h-0 flex-1 overflow-auto pt-1">
        <div
          className="grid min-w-full content-start gap-1"
          style={{ width: `${props.timelineZoom * 100}%` }}
        >
          {/* The ruler is a scrub surface too: press or drag on it to move the
              playhead, same handlers as the timeline body. */}
          <div
            className={cx("cursor-pointer touch-none", props.scrubbing && "cursor-ew-resize")}
            onPointerDown={props.onBodyPointerDown}
            onPointerMove={props.onBodyPointerMove}
            onPointerUp={props.onBodyPointerUp}
            onPointerCancel={props.onBodyPointerUp}
          >
            <TimelineRuler duration={props.renderDuration} />
          </div>

          {/* The body owns scrubbing, clip move/trim drags and asset drag & drop.
              touch-none keeps pointer capture stable during drags. */}
          <div
            className={cx(
              "relative grid min-h-[10rem] cursor-pointer select-none content-start gap-1 overflow-visible px-[var(--timeline-body-pad)] pb-2 pt-2 touch-none",
              props.scrubbing && "cursor-ew-resize"
            )}
            ref={props.bodyRef}
            onPointerDown={props.onBodyPointerDown}
            onPointerMove={props.onBodyPointerMove}
            onPointerUp={props.onBodyPointerUp}
            onPointerCancel={props.onBodyPointerUp}
            onContextMenu={props.onBodyContextMenu}
            onDragOver={handleBodyDragOver}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setTransitionDropKey(null);
              }
            }}
            onDrop={handleBodyDrop}
          >
        <TimelinePlayhead
          playheadPercent={props.playheadPercent}
          currentTime={props.currentTime}
          color="#ffffff"
          onPointerDown={props.onBodyPointerDown}
          onPointerMove={props.onBodyPointerMove}
          onPointerUp={props.onBodyPointerUp}
        />

        <TimelineTrack label="Video 1" icon={<Film size={14} />}>
          {props.videoClips.map((clip) => (
            <TimelineClip
              key={clip.id}
              clip={clip}
              timelineDuration={props.renderDuration}
              selected={props.selectedSegmentId === clip.id}
              onSelect={() => props.onSelectClip(clip)}
              onTrimPointerDown={props.onTrimPointerDown}
              onMovePointerDown={props.onMovePointerDown}
              onInteractionPointerMove={props.onBodyPointerMove}
              onInteractionPointerUp={props.onBodyPointerUp}
            />
          ))}
          {transitionDropKey ? transitionBoundaries.map((boundary) => (
            <TimelineTransitionDropTarget
              key={boundary.key}
              cutTime={boundary.cutTime}
              timelineDuration={props.renderDuration}
              active={transitionDropKey === boundary.key}
            />
          )) : null}
          {props.transitions.map((transition) => {
            const from = props.videoClips.find((clip) => clip.id === transition.fromSegmentId);
            return from ? (
              <TimelineTransitionMarker
                key={transition.id}
                transition={transition}
                cutTime={from.start + from.duration}
                timelineDuration={props.renderDuration}
                onSelect={() => props.onSelectTransition(transition)}
              />
            ) : null;
          })}
        </TimelineTrack>

        <TimelineTrack label="Zoom" icon={<ZoomIn size={14} />}>
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

        <TimelineTrack label="Speed" icon={<SpeedIcon size={14} />}>
          {getOrderedZoomTimingItems(props.speedEffects).map((effect) => (
            <TimelineSpeedClip
              key={effect.id}
              effect={effect}
              duration={props.renderDuration}
              selected={props.selectedSpeedId === effect.id}
              onSelect={() => props.onSelectSpeed(effect)}
              onDragPointerDown={props.onSpeedDragPointerDown}
            />
          ))}
        </TimelineTrack>

        <TimelineTrack label="Subtitles" icon={<Captions size={14} />}>
          {props.subtitles.map((subtitle) => (
            <TimelineSubtitleClip
              key={subtitle.id}
              subtitle={subtitle}
              duration={props.renderDuration}
              selected={props.selectedSubtitleId === subtitle.id}
              onSelect={() => props.onSelectSubtitle(subtitle.id)}
              onDragPointerDown={props.onSubtitleDragPointerDown}
            />
          ))}
        </TimelineTrack>

        <TimelineTrack label="Text" icon={<Type size={14} />}>
          {props.textOverlays.map((overlay) => (
            <TimelineTextClip
              key={overlay.id}
              overlay={overlay}
              duration={props.renderDuration}
              selected={props.selectedTextOverlayId === overlay.id}
              onSelect={() => props.onSelectTextOverlay(overlay)}
              onDragPointerDown={props.onTextOverlayDragPointerDown}
            />
          ))}
        </TimelineTrack>

        {props.audioTracks.map((track) => (
              <TimelineTrack
                key={track.lane}
                label={`Audio ${track.lane + 1}`}
                icon={<AudioLines size={14} />}
              >
                {track.clips.map((clip) => (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    audioLevel={props.audioLevels[clip.item.id]}
                    timelineDuration={props.renderDuration}
                    selected={props.selectedSegmentId === clip.id}
                    onSelect={() => props.onSelectClip(clip)}
                    onTrimPointerDown={props.onTrimPointerDown}
                    onMovePointerDown={props.onMovePointerDown}
                    onInteractionPointerMove={props.onBodyPointerMove}
                    onInteractionPointerUp={props.onBodyPointerUp}
                  />
                ))}
              </TimelineTrack>
            ))}
          </div>
        </div>
      </div>

      <TimelineToolbar
        timelineZoom={props.timelineZoom}
        canSplit={props.canSplitAtPlayhead}
        canDelete={props.selectedSegmentId !== null}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onSplit={props.onSplitAtPlayhead}
        onDelete={props.onDeleteSelected}
        onZoomIn={props.onZoomIn}
        onZoomOut={props.onZoomOut}
        onZoomReset={props.onZoomReset}
      />

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
