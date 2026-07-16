/** Track-lane composition for the editor timeline. */
import { AudioLines, Captions, Film, Type, ZoomIn } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getOrderedZoomTimingItems } from "../zoom-timing";
import { SpeedIcon } from "./SpeedIcon";
import {
  TimelineClip,
  TimelineSpeedClip,
  TimelineSubtitleClip,
  TimelineSubtitleShimmer,
  TimelineTextClip,
  TimelineTransitionDropTarget,
  TimelineTransitionMarker,
  TimelineZoomClip
} from "./TimelineClips";
import { TimelineTrack } from "./TimelineTrack";
import type { TimelineTransitionBoundary } from "./transition-utils";
import type {
  ClipTransition,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineMediaClip,
  TimelineRangeSelection,
  TimelineTrimEdge,
  ZoomEffect
} from "./types";

type TimelineTracksProps = {
  renderDuration: number;
  videoClips: TimelineMediaClip[];
  audioTracks: Array<{ lane: number; clips: TimelineMediaClip[] }>;
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  zoomEffects: ZoomEffect[];
  speedEffects: SpeedEffect[];
  transitions: ClipTransition[];
  transitionBoundaries: TimelineTransitionBoundary[];
  transitionDropKey: string | null;
  subtitles: SubtitleSegment[];
  subtitleProcessing?: boolean;
  textOverlays: TextOverlay[];
  selectedSegmentIds: string[];
  rangeSelection: TimelineRangeSelection | null;
  selectedZoomId: string | null;
  selectedSpeedId: string | null;
  selectedSubtitleId: string | null;
  selectedTextOverlayId: string | null;
  onSelectClip: (clip: TimelineMediaClip, additive: boolean) => void;
  onSelectZoom: (effect: ZoomEffect) => void;
  onSelectSpeed: (effect: SpeedEffect) => void;
  onSelectTransition: (transition: ClipTransition) => void;
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
  onInteractionPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onInteractionPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function TimelineTracks(props: TimelineTracksProps) {
  return (
    <>
      <TimelineRangeOverlay
        selection={props.rangeSelection}
        duration={props.renderDuration}
        selectedCount={props.selectedSegmentIds.length}
      />

      <TimelineTrack label="Video 1" icon={<Film size={14} />}>
        {props.videoClips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            timelineDuration={props.renderDuration}
            selected={props.selectedSegmentIds.includes(clip.id)}
            onSelect={(additive) => props.onSelectClip(clip, additive)}
            onTrimPointerDown={props.onTrimPointerDown}
            onMovePointerDown={props.onMovePointerDown}
            onInteractionPointerMove={props.onInteractionPointerMove}
            onInteractionPointerUp={props.onInteractionPointerUp}
          />
        ))}
        {props.transitionDropKey
          ? props.transitionBoundaries.map((boundary) => (
              <TimelineTransitionDropTarget
                key={boundary.key}
                cutTime={boundary.cutTime}
                timelineDuration={props.renderDuration}
                active={props.transitionDropKey === boundary.key}
              />
            ))
          : null}
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
        {props.subtitleProcessing ? <TimelineSubtitleShimmer /> : null}
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
              selected={props.selectedSegmentIds.includes(clip.id)}
              onSelect={(additive) => props.onSelectClip(clip, additive)}
              onTrimPointerDown={props.onTrimPointerDown}
              onMovePointerDown={props.onMovePointerDown}
              onInteractionPointerMove={props.onInteractionPointerMove}
              onInteractionPointerUp={props.onInteractionPointerUp}
            />
          ))}
        </TimelineTrack>
      ))}
    </>
  );
}

function TimelineRangeOverlay(props: {
  selection: TimelineRangeSelection | null;
  duration: number;
  selectedCount: number;
}) {
  if (!props.selection || props.duration <= 0) return null;

  const start = Math.max(0, Math.min(props.selection.start, props.duration));
  const end = Math.max(start, Math.min(props.selection.end, props.duration));
  const startRatio = start / props.duration;
  const widthRatio = (end - start) / props.duration;
  const laneWidth =
    "(100% - (2 * var(--timeline-body-pad)) - var(--timeline-label-width) - var(--timeline-track-gap))";

  return (
    <div
      className="pointer-events-none absolute bottom-2 top-2 z-[4] border-x border-white/55 bg-white/[0.075] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)]"
      data-timeline-range-selection
      style={{
        left: `calc(var(--timeline-body-pad) + var(--timeline-label-width) + var(--timeline-track-gap) + (${startRatio} * ${laneWidth}))`,
        width: `calc(${widthRatio} * ${laneWidth})`
      }}
    >
      <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[0.58rem] font-bold text-black shadow">
        {props.selectedCount} {props.selectedCount === 1 ? "clip" : "clips"}
      </span>
    </div>
  );
}
