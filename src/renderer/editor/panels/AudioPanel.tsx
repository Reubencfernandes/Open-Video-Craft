import { AudioLines, Music2, Sparkles, Volume2, VolumeX } from "lucide-react";
import {
  AUDIO_CLEANUP_PRESETS,
  type AudioCleanupSettings,
  type AudioCleanupState,
  normalizeAudioCleanupSettings
} from "../../../shared/editor-domain";
import { BubbleActionButton } from "../../BubbleActionButton";
import { cx } from "../../classNames";
import { dbToLinearPercent, formatDb, maxVolumeDb, minVolumeDb, percentToSliderDb } from "../audio-utils";
import { RangeControl } from "../controls";
import type { EditorMediaItem } from "../types";
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
  audioCleanup: AudioCleanupState;
  onSetAudioCleanup: (itemId: string, settings: AudioCleanupSettings | null) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddBackgroundMusic: () => void;
  onSelectItem: (itemId: string) => void;
  onSetAudioLevel: (itemId: string, patch: Partial<AudioLevel>) => void;
}) {
  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <DbSlider
        label="Master volume"
        percent={props.masterVolume}
        onPercentChange={props.onMasterVolumeChange}
      />

      <BubbleActionButton
        className="min-h-11 w-full rounded-xl px-3 text-sm font-extrabold"
        onClick={props.onAddBackgroundMusic}
      >
        <Music2 size={16} />
        Add audio clip
      </BubbleActionButton>
      <div className="grid gap-3">
        {props.audioSources.map((item) => (
          <AudioSourceRow
            key={item.id}
            item={item}
            level={props.audioLevels[item.id] ?? { volume: 100, muted: false }}
            cleanup={props.audioCleanup[item.id]}
            onSelect={() => props.onSelectItem(item.id)}
            onSetCleanup={(settings) => props.onSetAudioCleanup(item.id, settings)}
            onSetLevel={(patch) => props.onSetAudioLevel(item.id, patch)}
          />
        ))}
        {props.audioSources.length === 0 ? (
          <div className="rounded-lg bg-white/[0.025] p-4 text-center text-sm font-bold text-slate-400">
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
  cleanup: AudioCleanupSettings | undefined;
  onSelect: () => void;
  onSetLevel: (patch: Partial<AudioLevel>) => void;
  onSetCleanup: (settings: AudioCleanupSettings | null) => void;
}) {
  return (
    <div
      className={cx(
        "grid gap-2 rounded-lg bg-white/[0.04] p-3",
        props.level.muted && "opacity-60"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <button
          className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-bold text-white"
          type="button"
          onClick={props.onSelect}
        >
          <AudioLines size={14} />
          <span className="truncate">{props.item.name}</span>
        </button>
        <button
          className="grid size-8 place-items-center rounded-md bg-white/[0.06] text-slate-200 hover:bg-white/10"
          type="button"
          title={props.level.muted ? "Unmute" : "Mute"}
          onClick={() => props.onSetLevel({ muted: !props.level.muted })}
        >
          {props.level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
      <RangeControl
        label="Volume"
        min={minVolumeDb}
        max={maxVolumeDb}
        step={1}
        value={percentToSliderDb(props.level.volume)}
        formatValue={() => formatDb(props.level.volume)}
        onChange={(value) => props.onSetLevel({ volume: dbToLinearPercent(value) })}
      />

      <div className="grid gap-2 rounded-lg bg-emerald-400/[0.05] p-2.5 ring-1 ring-inset ring-emerald-300/10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-100">
            <Sparkles size={13} /> Voice cleanup
          </span>
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-[0.65rem] font-bold text-slate-200 hover:bg-white/10"
            type="button"
            onClick={() => props.onSetCleanup(props.cleanup ? null : normalizeAudioCleanupSettings({ preset: "wind", strength: 35 }))}
          >
            {props.cleanup ? "Disable" : "Enable"}
          </button>
        </div>
        {props.cleanup ? (
          <>
            <label className="grid gap-1 text-[0.65rem] font-bold text-slate-400">
              Preset
              <select
                className="editor-field rounded-lg bg-white/[0.06] p-2 text-xs font-bold text-white"
                value={props.cleanup.preset}
                onChange={(event) => props.onSetCleanup(normalizeAudioCleanupSettings({
                  preset: event.target.value,
                  strength: props.cleanup?.strength
                }))}
              >
                {AUDIO_CLEANUP_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset === "wind" ? "Wind" : preset === "room" ? "Room" : "Steady noise"}
                  </option>
                ))}
              </select>
            </label>
            <RangeControl
              label="Cleanup strength"
              min={0}
              max={100}
              step={5}
              value={props.cleanup.strength}
              formatValue={() => `${props.cleanup?.strength ?? 0}%`}
              onChange={(value) => props.onSetCleanup(normalizeAudioCleanupSettings({
                preset: props.cleanup?.preset,
                strength: value
              }))}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
