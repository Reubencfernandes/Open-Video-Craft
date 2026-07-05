import { AudioLines, Music2, Volume2, VolumeX } from "lucide-react";
import { RangeControl } from "../controls";
import type { EditorMediaItem } from "../types";

export type AudioLevel = { volume: number; muted: boolean };

/**
 * "Audio" tool: master volume, background-music import, and per-source volume
 * and mute controls for every audio item in the project.
 */
export function AudioPanel(props: {
  masterVolume: number;
  audioSources: EditorMediaItem[];
  audioLevels: Record<string, AudioLevel>;
  onMasterVolumeChange: (volume: number) => void;
  onAddBackgroundMusic: () => void;
  onSelectItem: (itemId: string) => void;
  onSetAudioLevel: (itemId: string, patch: Partial<AudioLevel>) => void;
}) {
  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <RangeControl
        label="Master volume"
        min={0}
        max={200}
        value={props.masterVolume}
        suffix="%"
        onChange={props.onMasterVolumeChange}
      />
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-extrabold text-white hover:bg-white/10"
        type="button"
        onClick={props.onAddBackgroundMusic}
      >
        <Music2 size={16} />
        Add background music
      </button>
      <div className="grid gap-3">
        {props.audioSources.map((item) => {
          const level = props.audioLevels[item.id] ?? { volume: 100, muted: false };
          return (
            <div
              className={`grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 ${
                level.muted ? "opacity-60" : ""
              }`}
              key={item.id}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                <button
                  className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-bold text-white"
                  type="button"
                  onClick={() => props.onSelectItem(item.id)}
                >
                  <AudioLines size={14} />
                  <span className="truncate">{item.name}</span>
                </button>
                <output className="text-xs font-extrabold text-slate-400 tabular-nums">
                  {level.volume}%
                </output>
                <button
                  className="grid size-8 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/10"
                  type="button"
                  title={level.muted ? "Unmute" : "Mute"}
                  onClick={() => props.onSetAudioLevel(item.id, { muted: !level.muted })}
                >
                  {level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
              <input
                className="w-full accent-amber-500"
                type="range"
                min={0}
                max={200}
                value={level.volume}
                onChange={(event) =>
                  props.onSetAudioLevel(item.id, { volume: Number(event.target.value) })
                }
              />
            </div>
          );
        })}
        {props.audioSources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
            Record with a mic or add music to control audio
          </div>
        ) : null}
      </div>
    </div>
  );
}
