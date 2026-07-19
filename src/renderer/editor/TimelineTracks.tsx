/** Track-lane composition for the editor timeline. */
import { AudioLines, Captions, Film, Type, Volume2, VolumeX, ZoomIn } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getAudioLaneLevelKey, getEffectiveAudioLevel } from "../../shared/editor-domain";
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
import { isTimelineTimedItemInRange } from "./timeline-utils";
import type { TimelineTransitionBoundary } from "./transition-utils";
import type {
  ClipTransition,
  SpeedEffect,
  SubtitleSegment,
  TextOverlay,
  TimelineLaneId,
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
  selectedCount: number;
  selectedNoun: "clip" | "item";
  rangeSelection: TimelineRangeSelection | null;
  selectedZoomId: string | null;
  selectedSpeedId: string | null;
  selectedSubtitleId: string | null;
  selectedTextOverlayId: string | null;
  onSetAudioLevel: (
    itemId: string,
    patch: Partial<{ volume: number; muted: boolean }>
  ) => void;
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
  const orderedLaneIds: TimelineLaneId[] = [
    "video",
    "zoom",
    "speed",
    "subtitles",
    "text",
    ...props.audioTracks.map((track) => getAudioTimelineLaneId(track.lane))
  ];
  const firstSelectedLaneId = orderedLaneIds.find((laneId) =>
    props.rangeSelection?.laneIds.includes(laneId)
  );
  const selectionOverlay = (laneId: TimelineLaneId) => (
    <TimelineLaneRangeOverlay
      laneId={laneId}
      selection={props.rangeSelection}
      duration={props.renderDuration}
      selectedCount={props.selectedCount}
      selectedNoun={props.selectedNoun}
      showCount={firstSelectedLaneId === laneId}
    />
  );

  return (
    <>
      <TimelineTrack laneId="video" label="Video 1" icon={<Film size={14} />}>
        {selectionOverlay("video")}
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

      <TimelineTrack laneId="zoom" label="Zoom" icon={<ZoomIn size={14} />}>
        {selectionOverlay("zoom")}
        {getOrderedZoomTimingItems(props.zoomEffects).map((effect) => (
          <TimelineZoomClip
            key={effect.id}
            effect={effect}
            duration={props.renderDuration}
            selected={
              props.selectedZoomId === effect.id ||
              isTimelineTimedItemInRange(
                props.rangeSelection,
                "zoom",
                effect.start,
                effect.end
              )
            }
            onSelect={() => props.onSelectZoom(effect)}
            onDragPointerDown={props.onZoomDragPointerDown}
          />
        ))}
      </TimelineTrack>

      <TimelineTrack laneId="speed" label="Speed" icon={<SpeedIcon size={14} />}>
        {selectionOverlay("speed")}
        {getOrderedZoomTimingItems(props.speedEffects).map((effect) => (
          <TimelineSpeedClip
            key={effect.id}
            effect={effect}
            duration={props.renderDuration}
            selected={
              props.selectedSpeedId === effect.id ||
              isTimelineTimedItemInRange(
                props.rangeSelection,
                "speed",
                effect.start,
                effect.end
              )
            }
            onSelect={() => props.onSelectSpeed(effect)}
            onDragPointerDown={props.onSpeedDragPointerDown}
          />
        ))}
      </TimelineTrack>

      <TimelineTrack laneId="subtitles" label="Subtitles" icon={<Captions size={14} />}>
        {selectionOverlay("subtitles")}
        {props.subtitleProcessing ? <TimelineSubtitleShimmer /> : null}
        {props.subtitles.map((subtitle) => (
          <TimelineSubtitleClip
            key={subtitle.id}
            subtitle={subtitle}
            duration={props.renderDuration}
            selected={
              props.selectedSubtitleId === subtitle.id ||
              isTimelineTimedItemInRange(
                props.rangeSelection,
                "subtitles",
                subtitle.start,
                subtitle.end
              )
            }
            onSelect={() => props.onSelectSubtitle(subtitle.id)}
            onDragPointerDown={props.onSubtitleDragPointerDown}
          />
        ))}
      </TimelineTrack>

      <TimelineTrack laneId="text" label="Text" icon={<Type size={14} />}>
        {selectionOverlay("text")}
        {props.textOverlays.map((overlay) => (
          <TimelineTextClip
            key={overlay.id}
            overlay={overlay}
            duration={props.renderDuration}
            selected={
              props.selectedTextOverlayId === overlay.id ||
              isTimelineTimedItemInRange(
                props.rangeSelection,
                "text",
                overlay.start,
                overlay.end
              )
            }
            onSelect={() => props.onSelectTextOverlay(overlay)}
            onDragPointerDown={props.onTextOverlayDragPointerDown}
          />
        ))}
      </TimelineTrack>

      {props.audioTracks.map((track) => {
        const laneId = getAudioTimelineLaneId(track.lane);
        const itemIds = [...new Set(track.clips.map((clip) => clip.item.id))];
        const laneLevelKey = getAudioLaneLevelKey(track.lane);
        const laneMuted = props.audioLevels[laneLevelKey]?.muted ?? false;
        const hasInheritedSourceMute = itemIds.some(
          (itemId) => props.audioLevels[itemId]?.muted ?? false
        );
        const pressed = laneMuted ? true : hasInheritedSourceMute ? "mixed" : false;
        const action = laneMuted ? "Unmute" : "Mute";

        return (
          <TimelineTrack
            key={track.lane}
            laneId={laneId}
            label={`Audio ${track.lane + 1}`}
            icon={<AudioLines size={14} />}
            labelControl={
              <button
                className="grid size-6 flex-none place-items-center rounded text-neutral-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                type="button"
                aria-label={`${action} Audio ${track.lane + 1}`}
                aria-pressed={pressed}
                title={`${action} Audio ${track.lane + 1}`}
                data-timeline-audio-mute={track.lane}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  props.onSetAudioLevel(laneLevelKey, { muted: !laneMuted });
                }}
              >
                {laneMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            }
          >
            {selectionOverlay(laneId)}
            {track.clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                audioLevel={getEffectiveAudioLevel(
                  props.audioLevels,
                  clip.item.id,
                  track.lane
                )}
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
        );
      })}
    </>
  );
}

function TimelineLaneRangeOverlay(props: {
  laneId: TimelineLaneId;
  selection: TimelineRangeSelection | null;
  duration: number;
  selectedCount: number;
  selectedNoun: "clip" | "item";
  showCount: boolean;
}) {
  if (
    !props.selection ||
    props.duration <= 0 ||
    !props.selection.laneIds.includes(props.laneId)
  ) {
    return null;
  }

  const start = Math.max(0, Math.min(props.selection.start, props.duration));
  const end = Math.max(start, Math.min(props.selection.end, props.duration));
  const startRatio = start / props.duration;
  const widthRatio = (end - start) / props.duration;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-[4] border border-white/55 bg-white/[0.075] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)]"
      data-timeline-range-selection
      data-timeline-range-lane={props.laneId}
      style={{
        left: `${startRatio * 100}%`,
        width: `${widthRatio * 100}%`
      }}
    >
      {props.showCount && props.selectedCount > 0 ? (
        <span
          className="absolute left-1 top-1 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[0.58rem] font-bold text-black shadow"
          data-timeline-range-count
        >
          {props.selectedCount}{" "}
          {props.selectedCount === 1 ? props.selectedNoun : `${props.selectedNoun}s`}
        </span>
      ) : null}
    </div>
  );
}

function getAudioTimelineLaneId(lane: number): TimelineLaneId {
  return `audio:${lane}`;
}
