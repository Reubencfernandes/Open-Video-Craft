/**
 * Visibility wrapper that mounts the Timeline and forwards its props.
 */
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent
} from "react";
import { Timeline } from "./Timeline";
import type { SubtitleActivityRange } from "../../shared/subtitle-activity";
import type {
  EditorTool,
  ClipTransition,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineContextMenu,
  TimelineMediaClip,
  TimelineRangeSelection,
  ZoomEffect
} from "./types";

export function EditorTimelineSection(props: {
  visible: boolean;
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
  contentDuration: number;
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
  subtitleProcessing: boolean;
  subtitleProcessingRanges: SubtitleActivityRange[];
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
    edge: "start" | "end"
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
  if (!props.visible) {
    return null;
  }

  return (
    <Timeline
      bodyRef={props.bodyRef}
      onResizePointerDown={props.onResizePointerDown}
      onResizePointerMove={props.onResizePointerMove}
      onResizePointerUp={props.onResizePointerUp}
      onResizeDoubleClick={props.onResizeDoubleClick}
      timelineZoom={props.timelineZoom}
      onZoomIn={props.onZoomIn}
      onZoomOut={props.onZoomOut}
      onZoomReset={props.onZoomReset}
      onZoomWheel={props.onZoomWheel}
      onRulerPointerDown={props.onRulerPointerDown}
      onRulerPointerMove={props.onRulerPointerMove}
      onRulerPointerUp={props.onRulerPointerUp}
      onRulerPointerCancel={props.onRulerPointerCancel}
      onRulerContract={props.onRulerContract}
      onRulerExpand={props.onRulerExpand}
      onRulerReset={props.onRulerReset}
      activeTool={props.activeTool}
      playing={props.playing}
      scrubbing={props.scrubbing}
      currentTime={props.currentTime}
      currentFrame={props.currentFrame}
      totalFrames={props.totalFrames}
      playheadPercent={props.playheadPercent}
      contentDuration={props.contentDuration}
      renderDuration={props.renderDuration}
      videoClips={props.videoClips}
      audioTracks={props.audioTracks}
      audioLevels={props.audioLevels}
      onSetAudioLevel={props.onSetAudioLevel}
      zoomEffects={props.zoomEffects}
      speedEffects={props.speedEffects}
      transitions={props.transitions}
      subtitles={props.subtitles}
      subtitleProcessing={props.subtitleProcessing}
      subtitleProcessingRanges={props.subtitleProcessingRanges}
      textOverlays={props.textOverlays}
      selectedSegmentId={props.selectedSegmentId}
      selectedSegmentIds={props.selectedSegmentIds}
      rangeSelection={props.rangeSelection}
      selectedZoomId={props.selectedZoomId}
      selectedSpeedId={props.selectedSpeedId}
      selectedSubtitleId={props.selectedSubtitleId}
      selectedTextOverlayId={props.selectedTextOverlayId}
      contextMenu={props.contextMenu}
      canSplitAtContextMenu={props.canSplitAtContextMenu}
      canSplitAtPlayhead={props.canSplitAtPlayhead}
      onTogglePlayback={props.onTogglePlayback}
      onSeekFrame={props.onSeekFrame}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      onSplitAtPlayhead={props.onSplitAtPlayhead}
      onDeleteSelected={props.onDeleteSelected}
      onSelectClip={props.onSelectClip}
      onSelectZoom={props.onSelectZoom}
      onSelectSpeed={props.onSelectSpeed}
      onSelectTransition={props.onSelectTransition}
      onDropTransition={props.onDropTransition}
      onSelectSubtitle={props.onSelectSubtitle}
      onSelectTextOverlay={props.onSelectTextOverlay}
      onTrimPointerDown={props.onTrimPointerDown}
      onMovePointerDown={props.onMovePointerDown}
      onZoomDragPointerDown={props.onZoomDragPointerDown}
      onSpeedDragPointerDown={props.onSpeedDragPointerDown}
      onSubtitleDragPointerDown={props.onSubtitleDragPointerDown}
      onTextOverlayDragPointerDown={props.onTextOverlayDragPointerDown}
      onBodyPointerDown={props.onBodyPointerDown}
      onBodyPointerMove={props.onBodyPointerMove}
      onBodyPointerUp={props.onBodyPointerUp}
      onBodyContextMenu={props.onBodyContextMenu}
      onBodyDragOver={props.onBodyDragOver}
      onBodyDrop={props.onBodyDrop}
      onContextMenuSplit={props.onContextMenuSplit}
      onContextMenuDelete={props.onContextMenuDelete}
    />
  );
}
