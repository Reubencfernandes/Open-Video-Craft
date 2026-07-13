/**
 * Preview transport and preview-only actions.
 *
 * Keeping these controls separate from the media canvas prevents the preview
 * component from mixing playback chrome with layout rendering concerns.
 */
import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward
} from "lucide-react";

const transportButtonClassName =
  "grid size-7 place-items-center rounded text-slate-400 transition hover:bg-white/[0.08] hover:text-white";

export function PreviewTransportBar(props: {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
}) {
  return (
    <div className="grid min-h-10 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/[0.08] bg-[#181c23] px-3">
      {/* Empty first column keeps playback controls optically centered. */}
      <span aria-hidden="true" />

      <div className="inline-flex items-center gap-1.5" aria-label="Playback controls">
        <button className={transportButtonClassName} type="button" title="Jump to start" onClick={() => props.onSeekFrame(0)}><SkipBack size={16} /></button>
        <button className={transportButtonClassName} type="button" title="Previous frame" onClick={() => props.onSeekFrame(props.currentFrame - 1)}><ChevronsLeft size={17} /></button>
        <button className="grid size-8 place-items-center rounded bg-[#c9ad73] text-[#17130c] transition hover:bg-[#dbc188]" type="button" title={props.playing ? "Pause" : "Play"} onClick={props.onTogglePlayback}>
          {props.playing ? <Pause size={15} /> : <Play className="ml-0.5" size={15} />}
        </button>
        <button className={transportButtonClassName} type="button" title="Next frame" onClick={() => props.onSeekFrame(props.currentFrame + 1)}><ChevronsRight size={17} /></button>
        <button className={transportButtonClassName} type="button" title="Jump to end" onClick={() => props.onSeekFrame(props.totalFrames)}><SkipForward size={16} /></button>
      </div>

      {/* Empty third column keeps playback controls optically centered. */}
      <span aria-hidden="true" />
    </div>
  );
}
