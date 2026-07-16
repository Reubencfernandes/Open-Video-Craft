/**
 * Subtitles tool: Whisper transcription, style selection, and per-subtitle
 * text/timing editing.
 */
import { Captions, WandSparkles } from "lucide-react";
import { formatSeconds } from "../utils";
import type { SubtitleSegment, SubtitleStyle } from "../types";

/** State of the on-device Whisper speech-to-text pipeline. */
export type SttStatus = "idle" | "loading" | "transcribing" | "done" | "error";

const subtitleStyleOptions: Array<{ id: SubtitleStyle; label: string }> = [
  { id: "clean", label: "Clean" },
  { id: "karaoke", label: "Karaoke" },
  { id: "boxed", label: "Boxed" },
  { id: "pop", label: "Pop" }
];

/**
 * "Subs" tool: add subtitles manually or auto-generate them with on-device
 * speech-to-text, pick the rendering style, and edit the selected subtitle's
 * text and time window.
 */
export function SubtitlesPanel(props: {
  sttStatus: SttStatus;
  sttDownloadProgress: number | null;
  sttModelLabel: string;
  subtitleLanguage: string;
  subtitleStyle: SubtitleStyle;
  subtitles: SubtitleSegment[];
  selectedSubtitle: SubtitleSegment | null;
  onAddSubtitle: () => void;
  onGenerateSubtitles: () => void;
  onStyleChange: (style: SubtitleStyle) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  onSelectSubtitle: (subtitleId: string) => void;
}) {
  const selected = props.selectedSubtitle;

  return (
    <div className="grid min-h-0 content-start gap-3 overflow-auto">
      <button
        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm font-bold text-white hover:bg-white/10"
        type="button"
        onClick={props.onAddSubtitle}
      >
        <Captions className="shrink-0" size={16} />
        <span className="truncate">Add subtitle</span>
      </button>
      <p className="text-[0.68rem] leading-4 text-slate-500">
        First use downloads the on-device speech model and requires an internet connection. Transcription then runs in a background worker.
      </p>
      <button
        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={props.sttStatus === "loading" || props.sttStatus === "transcribing"}
        onClick={props.onGenerateSubtitles}
      >
        <WandSparkles className="shrink-0" size={16} />
        <span className="min-w-0 truncate">
          {props.sttStatus === "loading"
            ? `Loading ${props.sttModelLabel}${props.sttDownloadProgress === null ? "" : ` ${Math.round(props.sttDownloadProgress)}%`}…`
            : props.sttStatus === "transcribing"
              ? "Transcribing…"
              : "Auto-generate subtitles"}
        </span>
      </button>
      <div className="grid gap-2 rounded-lg border border-white/[0.08] p-3 text-xs">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="font-bold text-slate-400">Model</span>
          <span className="min-w-0 truncate text-right font-semibold text-white">{props.sttModelLabel}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="font-bold text-slate-400">Language</span>
          <span className="min-w-0 truncate text-right font-semibold text-white">{props.subtitleLanguage}</span>
        </div>
      </div>
      <div className="grid gap-2">
        <span className="text-xs font-bold text-slate-400">Subtitle style</span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-1.5 rounded-lg border border-white/[0.06] p-1.5">
          {subtitleStyleOptions.map((option) => (
            <button
              className={`min-h-9 whitespace-nowrap rounded-md px-2 text-center text-xs font-bold transition ${
                props.subtitleStyle === option.id
                  ? "bg-white text-[#111827]"
                  : "bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
              type="button"
              key={option.id}
              onClick={() => props.onStyleChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {selected ? (
        <div className="grid gap-3">
          <textarea
            className="min-h-24 resize-y rounded-lg border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
            value={selected.text}
            onChange={(event) => props.onUpdateSubtitle(selected.id, { text: event.target.value })}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
            <label className="grid gap-1 text-xs font-extrabold text-slate-400">
              <span>Start</span>
              <input
                className="h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 text-white"
                type="number"
                min={0}
                step={0.1}
                value={selected.start}
                onChange={(event) =>
                  props.onUpdateSubtitle(selected.id, { start: Number(event.target.value) })
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-extrabold text-slate-400">
              <span>End</span>
              <input
                className="h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 text-white"
                type="number"
                min={selected.start + 0.1}
                step={0.1}
                value={selected.end}
                onChange={(event) =>
                  props.onUpdateSubtitle(selected.id, { end: Number(event.target.value) })
                }
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          No subtitles
        </div>
      )}
      <div className="grid gap-2">
        {props.subtitles.map((subtitle) => (
          <button
            className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-bold ${
              selected?.id === subtitle.id
                ? "border-violet-400 bg-violet-400/10 text-white"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
            }`}
            type="button"
            key={subtitle.id}
            onClick={() => props.onSelectSubtitle(subtitle.id)}
          >
            <Captions className="shrink-0" size={15} />
            <span className="truncate">{subtitle.text}</span>
            <span className="whitespace-nowrap text-[0.62rem] font-semibold tabular-nums text-slate-500">
              {formatSeconds(subtitle.start)}–{formatSeconds(subtitle.end)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
