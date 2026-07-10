import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { Timeline } from "./Timeline";
import type {
  EditorTool,
  SpeedEffect,
  SubtitleSegment,
  TimelineContextMenu,
  TimelineMediaClip,
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
  activeTool: EditorTool;
  playing: boolean;
  scrubbing: boolean;
  currentTime: number;
  currentFrame: number;
  totalFrames: number;
  playheadPercent: number;
  renderDuration: number;
  videoClips: TimelineMediaClip[];
  audioTracks: Array<{ lane: number; clips: TimelineMediaClip[] }>;
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  subtitles: SubtitleSegment[];
  selectedSegmentId: string | null;
  selectedZoomId: string | null;
  selectedSpeedId: string | null;
  selectedSubtitleId: string | null;
  contextMenu: TimelineContextMenu;
  canSplitAtContextMenu: boolean;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
  onSelectClip: (clip: TimelineMediaClip) => void;
  onSelectZoom: (effect: ZoomEffect) => void;
  onSelectSpeed: (effect: SpeedEffect) => void;
  onSelectSubtitle: (subtitleId: string) => void;
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
  onBodyPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBodyPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBodyPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
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
      activeTool={props.activeTool}
      playing={props.playing}
      scrubbing={props.scrubbing}
      currentTime={props.currentTime}
      currentFrame={props.currentFrame}
      totalFrames={props.totalFrames}
      playheadPercent={props.playheadPercent}
      renderDuration={props.renderDuration}
      videoClips={props.videoClips}
      audioTracks={props.audioTracks}
      zoomEffects={props.zoomEffects}
      speedEffects={props.speedEffects}
      subtitles={props.subtitles}
      selectedSegmentId={props.selectedSegmentId}
      selectedZoomId={props.selectedZoomId}
      selectedSpeedId={props.selectedSpeedId}
      selectedSubtitleId={props.selectedSubtitleId}
      contextMenu={props.contextMenu}
      canSplitAtContextMenu={props.canSplitAtContextMenu}
      onTogglePlayback={props.onTogglePlayback}
      onSeekFrame={props.onSeekFrame}
      onSelectClip={props.onSelectClip}
      onSelectZoom={props.onSelectZoom}
      onSelectSpeed={props.onSelectSpeed}
      onSelectSubtitle={props.onSelectSubtitle}
      onTrimPointerDown={props.onTrimPointerDown}
      onMovePointerDown={props.onMovePointerDown}
      onZoomDragPointerDown={props.onZoomDragPointerDown}
      onSpeedDragPointerDown={props.onSpeedDragPointerDown}
      onSubtitleDragPointerDown={props.onSubtitleDragPointerDown}
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
