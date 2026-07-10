import { AudioLines, Music2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../../classNames";
import {
  dbToLinearPercent,
  formatDb,
  maxVolumeDb,
  minVolumeDb,
  percentToSliderDb
} from "../audio-utils";
import type { EditorMediaItem } from "../types";

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
      <LevelMeter getLevel={props.getAudioLevel} active={props.playing} />

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
        {props.audioSources.map((item) => {
          const level = props.audioLevels[item.id] ?? { volume: 100, muted: false };
          return (
            <div
              className={cx(
                "grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3",
                level.muted && "opacity-60"
              )}
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
                  {formatDb(level.volume)}
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
                min={minVolumeDb}
                max={maxVolumeDb}
                step={1}
                value={percentToSliderDb(level.volume)}
                onChange={(event) =>
                  props.onSetAudioLevel(item.id, {
                    volume: dbToLinearPercent(Number(event.target.value))
                  })
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

/** A gain slider that shows decibels but reports the underlying linear percent. */
function DbSlider(props: {
  label: string;
  percent: number;
  onPercentChange: (percent: number) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-extrabold text-slate-400">
      <span className="flex items-center justify-between gap-3">
        {props.label}
        <output className="rounded-md bg-white/[0.06] px-2 py-1 text-white tabular-nums">
          {formatDb(props.percent)}
        </output>
      </span>
      <input
        className="w-full accent-amber-500"
        type="range"
        min={minVolumeDb}
        max={maxVolumeDb}
        step={1}
        value={percentToSliderDb(props.percent)}
        onChange={(event) => props.onPercentChange(dbToLinearPercent(Number(event.target.value)))}
      />
    </label>
  );
}

/**
 * Live output meter. It polls the audio engine's peak level while playing and
 * colors green/amber/red so the user can see when their gain is pushing hot.
 */
function LevelMeter(props: { getLevel: () => number; active: boolean }) {
  const [level, setLevel] = useState(0);
  const getLevelRef = useRef(props.getLevel);
  getLevelRef.current = props.getLevel;

  useEffect(() => {
    if (!props.active) {
      setLevel(0);
      return undefined;
    }

    let raf = 0;
    let held = 0;
    const tick = () => {
      const next = getLevelRef.current();
      // Fast attack, slow release so short peaks stay readable.
      held = next > held ? next : held * 0.9;
      setLevel(held);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [props.active]);

  const percent = Math.min(100, Math.round(level * 100));
  const barColor =
    level > 0.85 ? "bg-red-500" : level > 0.6 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[0.62rem] font-bold uppercase tracking-[0.08em] text-slate-500">
        <span>Output level</span>
        <span className="tabular-nums">{props.active ? `${percent}%` : "idle"}</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cx("h-full rounded-full transition-[width] duration-75 ease-out", barColor)}
          style={{ width: `${percent}%` }}
        />
        {/* Zone guides at the amber (60%) and red (85%) thresholds. */}
        <span className="absolute inset-y-0 left-[60%] w-px bg-black/40" />
        <span className="absolute inset-y-0 left-[85%] w-px bg-black/40" />
      </div>
    </div>
  );
}
