/**
 * The bottom timeline panel: transport toolbar, horizontal zoom, ruler,
 * playhead, and the track lanes. Purely presentational; all interaction state
 * lives in EditorView's hooks.
 */
import { useMemo, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent
} from "react";
import { cx } from "../classNames";
import type { SubtitleActivityRange } from "../../shared/subtitle-activity";
import {
  TimelineContextMenuView,
  TimelinePlayhead,
  TimelineRuler,
  TimelineToolbar
} from "./TimelineChrome";
import { TimelineTracks } from "./TimelineTracks";
import { isTimelineTimedItemInRange } from "./timeline-utils";
import { formatSeconds } from "./utils";
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
  TimelineRangeSelection,
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
  onZoomWheel: (event: ReactWheelEvent<HTMLElement>) => void;
  onRulerPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onRulerPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onRulerPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onRulerPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onRulerContract: () => void;
  onRulerExpand: () => void;
  onRulerReset: () => void;
  activeTool: EditorTool;
  playing: boolean;
  scrubbing: boolean;
  currentTime: number;
  currentFrame: number;
  totalFrames: number;
  playheadPercent: number;
  /** The composition duration (the video end, or timed content for audio-only projects). */
  contentDuration: number;
  /** User-controlled visible duration; never smaller than contentDuration. */
  renderDuration: number;
  videoClips: TimelineMediaClip[];
  audioTracks: Array<{ lane: number; clips: TimelineMediaClip[] }>;
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  onSetAudioLevel: (
    itemId: string,
    patch: Partial<{ volume: number; muted: boolean }>
  ) => void;
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  transitions: ClipTransition[];
  subtitles: SubtitleSegment[];
  subtitleProcessing?: boolean;
  subtitleProcessingRanges?: SubtitleActivityRange[];
  textOverlays: TextOverlay[];
  selectedSegmentId: string | null;
  selectedSegmentIds: string[];
  rangeSelection: TimelineRangeSelection | null;
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
  onSelectClip: (clip: TimelineMediaClip, additive: boolean) => void;
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
  const rangeTimedItemCount = props.rangeSelection
    ? props.zoomEffects.filter((item) =>
        isTimelineTimedItemInRange(props.rangeSelection, "zoom", item.start, item.end)
      ).length +
      props.speedEffects.filter((item) =>
        isTimelineTimedItemInRange(props.rangeSelection, "speed", item.start, item.end)
      ).length +
      props.subtitles.filter((item) =>
        isTimelineTimedItemInRange(props.rangeSelection, "subtitles", item.start, item.end)
      ).length +
      props.textOverlays.filter((item) =>
        isTimelineTimedItemInRange(props.rangeSelection, "text", item.start, item.end)
      ).length
    : 0;
  const rangeSelectionCount = props.selectedSegmentIds.length + rangeTimedItemCount;
  const hasSelectedTimelineItem = Boolean(
    rangeSelectionCount > 0 ||
      props.selectedSegmentId ||
      props.selectedZoomId ||
      props.selectedSpeedId ||
      props.selectedSubtitleId ||
      props.selectedTextOverlayId
  );

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
        className="group absolute left-0 right-0 top-0 z-30 grid h-5 cursor-row-resize touch-none place-items-center border-0 bg-transparent p-0 outline-none focus-visible:bg-white/[0.04]"
        data-timeline-resize-handle
        type="button"
        aria-label="Resize timeline"
        title="Drag up or down to resize timeline · Double-click to reset"
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onPointerUp={props.onResizePointerUp}
        onPointerCancel={props.onResizePointerUp}
        onDoubleClick={props.onResizeDoubleClick}
      >
        <span className="h-1 w-16 rounded-full bg-white/[0.2] shadow-[0_1px_8px_rgb(0_0_0_/_0.35)] transition-all group-hover:w-20 group-hover:bg-white/55 group-active:bg-white/75" />
      </button>

      {/* Horizontal-zoom viewport: the ruler and track body grow past 100% and
          scroll together so the time axis can be zoomed in like a real NLE. */}
      <div
        className="min-h-0 flex-1 overflow-auto pt-1"
        data-timeline-zoom-viewport
        title="Ctrl/Cmd + mouse wheel or trackpad pinch to zoom timeline"
        onWheel={props.onZoomWheel}
      >
        <div
          className="grid min-w-full content-start gap-1"
          style={{ width: `${props.timelineZoom * 100}%` }}
        >
          {/* Dragging changes visible duration; horizontal zoom remains a
              separate concern handled by the toolbar and Ctrl/Cmd + wheel. */}
          <div
            className="cursor-ew-resize touch-none select-none"
            title="Drag left to shorten or right to extend visible timeline duration · Double-click to fit content · Click to move the playhead"
            role="slider"
            aria-label="Visible timeline duration"
            aria-valuemin={Math.max(1, Math.ceil(props.contentDuration))}
            aria-valuemax={Math.ceil(Math.max(props.contentDuration * 10, props.contentDuration + 600))}
            aria-valuenow={Math.round(props.renderDuration)}
            aria-valuetext={`${formatSeconds(props.renderDuration)} visible duration`}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "+") props.onRulerExpand();
              if (event.key === "ArrowLeft" || event.key === "-") props.onRulerContract();
              if (event.key === "Home") props.onRulerReset();
            }}
            onDoubleClick={props.onRulerReset}
            onPointerDown={props.onRulerPointerDown}
            onPointerMove={props.onRulerPointerMove}
            onPointerUp={props.onRulerPointerUp}
            onPointerCancel={props.onRulerPointerCancel}
          >
            <TimelineRuler duration={props.renderDuration} />
          </div>

          {/* The body owns scrubbing, clip move/trim drags and asset drag & drop.
              touch-none keeps pointer capture stable during drags. */}
          <div
            className={cx(
              "relative grid min-h-[10rem] select-none content-start gap-1 overflow-visible px-[var(--timeline-body-pad)] pb-2 pt-2 touch-none",
              props.scrubbing
                ? "cursor-ew-resize"
                : props.rangeSelection?.dragging
                  ? "cursor-crosshair"
                  : "cursor-default"
            )}
            data-timeline-body
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

        <TimelineTracks
          renderDuration={props.renderDuration}
          videoClips={props.videoClips}
          audioTracks={props.audioTracks}
          audioLevels={props.audioLevels}
          onSetAudioLevel={props.onSetAudioLevel}
          zoomEffects={props.zoomEffects}
          speedEffects={props.speedEffects}
          transitions={props.transitions}
          transitionBoundaries={transitionBoundaries}
          transitionDropKey={transitionDropKey}
          subtitles={props.subtitles}
          subtitleProcessing={props.subtitleProcessing}
          subtitleProcessingRanges={props.subtitleProcessingRanges}
          textOverlays={props.textOverlays}
          selectedSegmentIds={props.selectedSegmentIds}
          selectedCount={rangeSelectionCount}
          selectedNoun={rangeTimedItemCount > 0 ? "item" : "clip"}
          rangeSelection={props.rangeSelection}
          selectedZoomId={props.selectedZoomId}
          selectedSpeedId={props.selectedSpeedId}
          selectedSubtitleId={props.selectedSubtitleId}
          selectedTextOverlayId={props.selectedTextOverlayId}
          onSelectClip={props.onSelectClip}
          onSelectZoom={props.onSelectZoom}
          onSelectSpeed={props.onSelectSpeed}
          onSelectTransition={props.onSelectTransition}
          onSelectSubtitle={props.onSelectSubtitle}
          onSelectTextOverlay={props.onSelectTextOverlay}
          onTrimPointerDown={props.onTrimPointerDown}
          onMovePointerDown={props.onMovePointerDown}
          onZoomDragPointerDown={props.onZoomDragPointerDown}
          onSpeedDragPointerDown={props.onSpeedDragPointerDown}
          onSubtitleDragPointerDown={props.onSubtitleDragPointerDown}
          onTextOverlayDragPointerDown={props.onTextOverlayDragPointerDown}
          onInteractionPointerMove={props.onBodyPointerMove}
          onInteractionPointerUp={props.onBodyPointerUp}
        />
          </div>
        </div>
      </div>

      <TimelineToolbar
        timelineZoom={props.timelineZoom}
        canSplit={props.canSplitAtPlayhead}
        canDelete={hasSelectedTimelineItem}
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
