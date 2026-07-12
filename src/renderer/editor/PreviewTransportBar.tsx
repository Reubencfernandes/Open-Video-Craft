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
  "grid size-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/[0.08] hover:text-white";

export function PreviewTransportBar(props: {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  onTogglePlayback: () => void;
  onSeekFrame: (frame: number) => void;
}) {
  return (
    <div className="grid min-h-[4.15rem] flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/[0.06] px-5">
      {/* Empty first column keeps playback controls optically centered. */}
      <span aria-hidden="true" />

      <div className="inline-flex items-center gap-1.5" aria-label="Playback controls">
        <button className={transportButtonClassName} type="button" title="Jump to start" onClick={() => props.onSeekFrame(0)}><SkipBack size={16} /></button>
        <button className={transportButtonClassName} type="button" title="Previous frame" onClick={() => props.onSeekFrame(props.currentFrame - 1)}><ChevronsLeft size={17} /></button>
        <button className="grid size-11 place-items-center rounded-full border border-white/[0.12] bg-white/[0.08] text-white shadow-[0_10px_26px_rgb(0_0_0_/_0.45)] transition hover:bg-white/[0.16]" type="button" title={props.playing ? "Pause" : "Play"} onClick={props.onTogglePlayback}>
          {props.playing ? <Pause size={17} /> : <Play className="ml-0.5" size={17} />}
        </button>
        <button className={transportButtonClassName} type="button" title="Next frame" onClick={() => props.onSeekFrame(props.currentFrame + 1)}><ChevronsRight size={17} /></button>
        <button className={transportButtonClassName} type="button" title="Jump to end" onClick={() => props.onSeekFrame(props.totalFrames)}><SkipForward size={16} /></button>
      </div>

      {/* Empty third column keeps playback controls optically centered. */}
      <span aria-hidden="true" />
    </div>
  );
}
