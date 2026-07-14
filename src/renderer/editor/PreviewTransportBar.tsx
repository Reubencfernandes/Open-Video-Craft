/**
 * Preview transport bar: timecode readout on the left, playback transport in
 * the center, and master volume + fullscreen on the right.
 */
import {
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from "lucide-react";
import { useRef } from "react";
import { formatTimecode } from "./utils";

const transportButtonClassName =
  "grid size-8 place-items-center rounded-lg text-neutral-300 transition hover:bg-white/[0.08] hover:text-white";

export function PreviewTransportBar(props: {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  currentTime: number;
  renderDuration: number;
  masterVolume: number;
  fullscreen: boolean;
  onMasterVolumeChange: (volume: number) => void;
  onTogglePlayback: () => void;
  onToggleFullscreen: () => void;
  onSeekFrame: (frame: number) => void;
}) {
  // Remember the last audible volume so unmuting restores it instead of
  // snapping to an arbitrary level.
  const lastAudibleVolumeRef = useRef(props.masterVolume > 0 ? props.masterVolume : 100);
  if (props.masterVolume > 0) {
    lastAudibleVolumeRef.current = props.masterVolume;
  }
  const muted = props.masterVolume <= 0;

  return (
    <div className="grid min-h-12 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[#0b0b0d] px-4">
      <div className="inline-flex min-w-0 items-center gap-1.5 text-[0.74rem] font-semibold tabular-nums">
        <span className="text-white">
          {formatTimecode(props.currentTime, props.currentFrame)}
        </span>
        <span className="text-neutral-500">
          / {formatTimecode(props.renderDuration, props.totalFrames)}
        </span>
      </div>

      <div className="inline-flex items-center gap-1" aria-label="Playback controls">
        <button className={transportButtonClassName} type="button" title="Jump to start" onClick={() => props.onSeekFrame(0)}><SkipBack size={16} /></button>
        <button className={transportButtonClassName} type="button" title="Previous frame" onClick={() => props.onSeekFrame(props.currentFrame - 1)}><ChevronsLeft size={17} /></button>
        <button
          className="grid size-9 place-items-center rounded-lg text-white transition hover:bg-white/[0.1]"
          type="button"
          title={props.playing ? "Pause" : "Play"}
          onClick={props.onTogglePlayback}
        >
          {props.playing ? <Pause size={20} fill="currentColor" /> : <Play className="ml-0.5" size={20} fill="currentColor" />}
        </button>
        <button className={transportButtonClassName} type="button" title="Next frame" onClick={() => props.onSeekFrame(props.currentFrame + 1)}><ChevronsRight size={17} /></button>
        <button className={transportButtonClassName} type="button" title="Jump to end" onClick={() => props.onSeekFrame(props.totalFrames)}><SkipForward size={16} /></button>
      </div>

      <div className="inline-flex min-w-0 items-center justify-end gap-1.5">
        <button
          className={transportButtonClassName}
          type="button"
          title={muted ? "Unmute" : "Mute"}
          onClick={() =>
            props.onMasterVolumeChange(muted ? lastAudibleVolumeRef.current : 0)
          }
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          className="h-1 w-24 flex-none cursor-pointer accent-white"
          type="range"
          min={0}
          max={100}
          value={props.masterVolume}
          title="Master volume"
          aria-label="Master volume"
          onChange={(event) => props.onMasterVolumeChange(Number(event.target.value))}
        />
        <button
          className={`${transportButtonClassName} ml-1`}
          type="button"
          title={props.fullscreen ? "Exit fullscreen preview" : "Show preview fullscreen"}
          aria-label={props.fullscreen ? "Exit fullscreen preview" : "Show preview fullscreen"}
          aria-pressed={props.fullscreen}
          onClick={props.onToggleFullscreen}
        >
          {props.fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  );
}
