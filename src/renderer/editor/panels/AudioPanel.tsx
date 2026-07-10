import { AudioLines, Music2, Volume2, VolumeX } from "lucide-react";
import { cx } from "../../classNames";
import { dbToLinearPercent, formatDb, maxVolumeDb, minVolumeDb, percentToSliderDb } from "../audio-utils";
import type { EditorMediaItem } from "../types";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { DbSlider } from "./DbSlider";

export type AudioLevel = { volume: number; muted: boolean };

/**
 * "Audio" tool: a live output meter, master gain, background-music import, and
 * per-source gain/mute. Levels are edited in decibels (0 dB = unity) but stored
 * as linear percentages for backward-compatible project files.
 */
export function AudioPanel(props: {
  masterVolume: number;
  audioSources: EditorMediaItem[];
  audioLevels: Record<string, AudioLevel>;
  playing: boolean;
  getAudioLevel: () => number;
  onMasterVolumeChange: (volume: number) => void;
  onAddBackgroundMusic: () => void;
  onSelectItem: (itemId: string) => void;
  onSetAudioLevel: (itemId: string, patch: Partial<AudioLevel>) => void;
}) {
  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <AudioLevelMeter getLevel={props.getAudioLevel} active={props.playing} />

      <DbSlider
        label="Master volume"
        percent={props.masterVolume}
        onPercentChange={props.onMasterVolumeChange}
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
        {props.audioSources.map((item) => (
          <AudioSourceRow
            key={item.id}
            item={item}
            level={props.audioLevels[item.id] ?? { volume: 100, muted: false }}
            onSelect={() => props.onSelectItem(item.id)}
            onSetLevel={(patch) => props.onSetAudioLevel(item.id, patch)}
          />
        ))}
        {props.audioSources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
            Record with a mic or add music to control audio
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One audio source: name, dB readout, mute toggle and a dB gain slider. */
function AudioSourceRow(props: {
  item: EditorMediaItem;
  level: AudioLevel;
  onSelect: () => void;
  onSetLevel: (patch: Partial<AudioLevel>) => void;
}) {
  return (
    <div
      className={cx(
        "grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3",
        props.level.muted && "opacity-60"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
        <button
          className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-bold text-white"
          type="button"
          onClick={props.onSelect}
        >
          <AudioLines size={14} />
          <span className="truncate">{props.item.name}</span>
        </button>
        <output className="text-xs font-extrabold text-slate-400 tabular-nums">
          {formatDb(props.level.volume)}
        </output>
        <button
          className="grid size-8 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/10"
          type="button"
          title={props.level.muted ? "Unmute" : "Mute"}
          onClick={() => props.onSetLevel({ muted: !props.level.muted })}
        >
          {props.level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
      <input
        className="w-full accent-amber-500"
        type="range"
        min={minVolumeDb}
        max={maxVolumeDb}
        step={1}
        value={percentToSliderDb(props.level.volume)}
        onChange={(event) =>
          props.onSetLevel({ volume: dbToLinearPercent(Number(event.target.value)) })
        }
      />
    </div>
  );
}
