/**
 * Subtitles tool: speech-to-text (on-device Whisper or a cloud provider),
 * style selection, and per-subtitle text/timing editing.
 */
import { Captions, ChevronDown, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProviderKeysView, SttProviderId } from "../../../shared/types";
import { BubbleActionButton } from "../../BubbleActionButton";
import { ApiKeyPromptPill } from "./ApiKeyPromptPill";
import { FloatingSelect } from "../FloatingSelect";
import {
  formatSubtitleTimecode,
  parseSubtitleTimecode,
  subtitleMinimumDuration
} from "../subtitle-time";
import type { SubtitleSegment, SubtitleStyle } from "../types";
import type { SttStatus } from "../useSubtitleGeneration";

export type { SttStatus } from "../useSubtitleGeneration";

const subtitleStyleOptions: Array<{ id: SubtitleStyle; label: string }> = [
  { id: "clean", label: "Clean" },
  { id: "karaoke", label: "Karaoke" },
  { id: "boxed", label: "Boxed" },
  { id: "pop", label: "Pop" }
];

const sttProviderOptions: Array<{ id: SttProviderId; label: string }> = [
  { id: "whisper-local", label: "Whisper base multilingual (on-device)" },
  { id: "cohere", label: "Cohere Transcribe (cloud)" },
  { id: "gemini", label: "Gemini (cloud)" }
];

/** Languages supported by Cohere Transcribe. */
const cohereLanguageOptions: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" }, { code: "de", label: "German" },
  { code: "fr", label: "French" }, { code: "it", label: "Italian" },
  { code: "es", label: "Spanish" }, { code: "pt", label: "Portuguese" },
  { code: "el", label: "Greek" }, { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" }, { code: "vi", label: "Vietnamese" },
  { code: "zh", label: "Chinese" }, { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" }
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
  sttProvider: SttProviderId;
  providerKeys: ProviderKeysView | null;
  subtitleLanguage: string;
  subtitleStyle: SubtitleStyle;
  subtitles: SubtitleSegment[];
  selectedSubtitleId: string | null;
  selectedSubtitle: SubtitleSegment | null;
  duration: number;
  currentTime: number;
  onAddSubtitle: () => void;
  onGenerateSubtitles: () => void;
  onCancelTranscription: () => void;
  onSttProviderChange: (provider: SttProviderId) => void;
  onCohereLanguageChange: (language: string) => void;
  onOpenAiSettings: () => void;
  onStyleChange: (style: SubtitleStyle) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  onSelectSubtitle: (subtitleId: string | null) => void;
}) {
  const subtitleIdsKey = props.subtitles.map((subtitle) => subtitle.id).join("\u0000");
  const [expandedSubtitleId, setExpandedSubtitleId] = useState<string | null>(
    () => props.selectedSubtitleId ?? props.selectedSubtitle?.id ?? props.subtitles[0]?.id ?? null
  );
  const busy = props.sttStatus === "loading" || props.sttStatus === "transcribing";
  const isCloudProvider = props.sttProvider !== "whisper-local";
  const missingKey =
    (props.sttProvider === "cohere" && props.providerKeys?.hasCohereKey === false) ||
    (props.sttProvider === "gemini" && props.providerKeys?.hasGeminiKey === false);
  const providerLabel =
    sttProviderOptions.find((option) => option.id === props.sttProvider)?.label ??
    props.sttModelLabel;

  useEffect(() => {
    if (props.selectedSubtitleId) {
      setExpandedSubtitleId(props.selectedSubtitleId);
    }
  }, [props.selectedSubtitleId]);

  useEffect(() => {
    const subtitleIds = subtitleIdsKey ? subtitleIdsKey.split("\u0000") : [];
    setExpandedSubtitleId((current) => {
      if (current && subtitleIds.includes(current)) return current;
      return subtitleIds[0] ?? null;
    });
  }, [subtitleIdsKey]);

  return (
    <div className="grid min-h-0 content-start gap-3 overflow-auto">
      <BubbleActionButton
        className="min-h-11 w-full rounded-xl px-3 text-sm font-extrabold"
        onClick={props.onAddSubtitle}
      >
        <Captions className="shrink-0" size={16} />
        <span className="truncate">Add subtitle</span>
      </BubbleActionButton>
      <p className="text-[0.68rem] leading-4 text-slate-500">
        {isCloudProvider
          ? "Cloud transcription sends the project audio to the selected provider using your API key."
          : "First use downloads the on-device speech model and requires an internet connection. Transcription then runs in a background worker."}{" "}
        All camera, screen, and mic audio is transcribed together.
      </p>
      <button
        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={busy || missingKey}
        data-auto-generate-subtitles
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onGenerateSubtitles();
        }}
      >
        <WandSparkles className="shrink-0" size={16} />
        <span className="min-w-0 truncate">
          {props.sttStatus === "loading"
            ? `${isCloudProvider ? "Preparing audio" : `Loading ${props.sttModelLabel}`}${props.sttDownloadProgress === null ? "" : ` ${Math.round(props.sttDownloadProgress)}%`}…`
            : props.sttStatus === "transcribing"
              ? "Transcribing…"
              : "Auto-generate subtitles"}
        </span>
      </button>
      {busy && isCloudProvider ? (
        <button
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-300 hover:bg-white/10"
          type="button"
          onClick={props.onCancelTranscription}
        >
          <X size={13} /> Cancel transcription
        </button>
      ) : null}
      <div className="grid gap-2 rounded-lg border border-white/[0.08] p-3 text-xs">
        <div className="grid gap-1">
          <span className="font-bold text-slate-400">Model</span>
          <FloatingSelect
            ariaLabel="Model"
            value={props.sttProvider}
            disabled={busy}
            options={sttProviderOptions.map((option) => ({
              value: option.id,
              label: option.label
            }))}
            onChange={props.onSttProviderChange}
          />
        </div>
        {props.sttProvider === "cohere" ? (
          <div className="grid gap-1">
            <span className="font-bold text-slate-400">Spoken language</span>
            <FloatingSelect
              ariaLabel="Spoken language"
              value={props.providerKeys?.cohereLanguage ?? "en"}
              disabled={busy}
              options={cohereLanguageOptions.map((option) => ({
                value: option.code,
                label: option.label
              }))}
              onChange={props.onCohereLanguageChange}
            />
          </div>
        ) : null}
        {missingKey ? (
          <ApiKeyPromptPill
            onClick={props.onOpenAiSettings}
            provider={props.sttProvider === "cohere" ? "cohere" : "gemini"}
          >
            Add your {providerLabel.split(" ")[0]} API key to use this model
          </ApiKeyPromptPill>
        ) : null}
        {props.sttProvider === "whisper-local" ? (
          <>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="font-bold text-slate-400">Spoken language</span>
              <span className="min-w-0 truncate text-right font-semibold text-white">
                Auto-detect (any language)
              </span>
            </div>
            {props.subtitleLanguage !== "Auto-detected" ? (
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="font-bold text-slate-400">Detected</span>
                <span className="min-w-0 truncate text-right font-semibold text-white">
                  {props.subtitleLanguage}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="font-bold text-slate-400">Language</span>
            <span className="min-w-0 truncate text-right font-semibold text-white">{props.subtitleLanguage}</span>
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <span className="text-xs font-bold text-slate-400">Subtitle style</span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-1.5 rounded-lg border border-white/[0.06] p-1.5">
          {subtitleStyleOptions.map((option) => (
            <button
              className={`editor-choice-button min-h-9 whitespace-nowrap rounded-md px-2 text-center text-xs font-bold ${
                props.subtitleStyle === option.id
                  ? "bg-white text-[#111827]"
                  : "bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
              type="button"
              key={option.id}
              aria-pressed={props.subtitleStyle === option.id}
              onClick={() => props.onStyleChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {props.subtitles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
          No subtitles
        </div>
      ) : (
        <div className="relative grid" data-subtitle-timeline>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-5 left-[0.4375rem] top-4 w-px bg-white/[0.09]"
          />
          {props.subtitles.map((subtitle) => {
            const isActive =
              props.currentTime >= subtitle.start && props.currentTime < subtitle.end;
            const isSelected = expandedSubtitleId === subtitle.id;

            return (
              <SubtitleTimelineItem
                key={subtitle.id}
                subtitle={subtitle}
                duration={props.duration}
                active={isActive}
                selected={isSelected}
                onSelect={() => {
                  const nextId = isSelected ? null : subtitle.id;
                  setExpandedSubtitleId(nextId);
                  props.onSelectSubtitle(nextId);
                }}
                onUpdate={(updates) => props.onUpdateSubtitle(subtitle.id, updates)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubtitleTimelineItem(props: {
  subtitle: SubtitleSegment;
  duration: number;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<SubtitleSegment>) => void;
}) {
  const editorId = `subtitle-editor-${props.subtitle.id}`;
  const surfaceClassName = props.active
    ? "bg-[#ff3b5c]/[0.11] text-white"
    : props.selected
      ? "bg-white/[0.075] text-white"
      : "bg-transparent text-neutral-400 hover:bg-white/[0.045] hover:text-neutral-200";

  return (
    <div className="relative min-w-0 pb-2 pl-6">
      <span
        aria-hidden="true"
        className={`absolute left-1 top-[0.82rem] z-[1] size-[0.4375rem] rounded-full transition-[background-color,box-shadow,transform] duration-200 ${
          props.active
            ? "scale-110 bg-[#ff3b5c] shadow-[0_0_0_3px_rgb(255_59_92_/_0.16),0_0_12px_rgb(255_59_92_/_0.8)]"
            : "bg-neutral-600"
        }`}
      />
      <div
        className={`overflow-hidden rounded-xl transition-[background-color,color,box-shadow] duration-300 ${surfaceClassName} ${
          props.selected ? "shadow-[0_12px_30px_rgb(0_0_0_/_0.22)]" : ""
        }`}
      >
        <button
          className="group grid w-full min-w-0 gap-1 bg-transparent px-3 py-2.5 text-left"
          type="button"
          aria-controls={editorId}
          aria-current={props.active ? "true" : undefined}
          aria-expanded={props.selected}
          aria-pressed={props.selected}
          data-active-subtitle={props.active ? "true" : undefined}
          onClick={props.onSelect}
        >
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span
              className={`min-w-0 truncate text-[0.62rem] font-bold uppercase tracking-[0.08em] tabular-nums transition-colors ${
                props.active ? "text-[#ff6b82]" : "text-neutral-600 group-hover:text-neutral-500"
              }`}
            >
              {formatSubtitleTimecode(props.subtitle.start)} — {formatSubtitleTimecode(props.subtitle.end)}
            </span>
            <ChevronDown
              className={`shrink-0 transition-transform duration-300 ${props.selected ? "rotate-180 text-white" : "text-neutral-600"}`}
              size={14}
            />
          </span>
          <span className="whitespace-normal break-words text-[0.82rem] font-semibold leading-5">
            {props.subtitle.text}
          </span>
          {props.active ? (
            <span className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[#ff6b82]">
              Playing now
            </span>
          ) : null}
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            props.selected
              ? "grid-rows-[1fr] opacity-100"
              : "pointer-events-none grid-rows-[0fr] opacity-0"
          }`}
          aria-hidden={!props.selected}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className="grid gap-2.5 border-t border-white/[0.07] px-3 pb-3 pt-2.5"
              id={editorId}
              data-subtitle-editor={props.selected ? "true" : undefined}
            >
              <label className="grid gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-neutral-500">
                <span>Subtitle text</span>
                <textarea
                  className="min-h-20 resize-y rounded-lg border border-white/[0.09] bg-black/25 p-2.5 text-xs font-semibold normal-case leading-5 tracking-normal text-white outline-none transition-[border-color,background-color,box-shadow] placeholder:text-neutral-600 focus:border-white/25 focus:bg-black/35 focus:shadow-[0_0_0_3px_rgb(255_255_255_/_0.05)] disabled:opacity-50"
                  value={props.subtitle.text}
                  disabled={!props.selected}
                  onChange={(event) => props.onUpdate({ text: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SubtitleTimeInput
                  label="Start"
                  seconds={props.subtitle.start}
                  minimum={0}
                  maximum={Math.max(
                    0,
                    Math.min(
                      props.subtitle.end - subtitleMinimumDuration,
                      props.duration > 0
                        ? props.duration - subtitleMinimumDuration
                        : Number.POSITIVE_INFINITY
                    )
                  )}
                  disabled={!props.selected}
                  onCommit={(start) => props.onUpdate({ start })}
                />
                <SubtitleTimeInput
                  label="End"
                  seconds={props.subtitle.end}
                  minimum={props.subtitle.start + subtitleMinimumDuration}
                  maximum={props.duration > 0 ? props.duration : undefined}
                  disabled={!props.selected}
                  onCommit={(end) => props.onUpdate({ end })}
                />
              </div>
              <span className="text-center text-[0.56rem] font-semibold text-neutral-600">
                Enter seconds, MM:SS.mmm, or HH:MM:SS.mmm
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubtitleTimeInput(props: {
  label: "Start" | "End";
  seconds: number;
  minimum: number;
  maximum?: number;
  disabled: boolean;
  onCommit: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatSubtitleTimecode(props.seconds));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(formatSubtitleTimecode(props.seconds));
    setInvalid(false);
  }, [props.seconds]);

  const commit = () => {
    const parsed = parseSubtitleTimecode(draft);
    if (parsed === null) {
      setDraft(formatSubtitleTimecode(props.seconds));
      setInvalid(true);
      return;
    }

    const maximum = props.maximum === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(props.minimum, props.maximum);
    const clamped = Math.min(
      Math.max(parsed, props.minimum),
      maximum
    );
    const precise = Math.round(clamped * 1000) / 1000;
    setInvalid(false);
    setDraft(formatSubtitleTimecode(precise));
    if (precise !== props.seconds) props.onCommit(precise);
  };

  return (
    <label className="grid min-w-0 gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-neutral-500">
      <span>{props.label}</span>
      <input
        className={`h-9 min-w-0 rounded-lg border bg-black/25 px-2 text-center text-xs font-bold tabular-nums tracking-normal text-white outline-none transition-[border-color,background-color,box-shadow] disabled:opacity-50 ${
          invalid
            ? "border-rose-400/70 focus:border-rose-300 focus:shadow-[0_0_0_3px_rgb(251_113_133_/_0.12)]"
            : "border-white/[0.09] focus:border-white/25 focus:bg-black/35 focus:shadow-[0_0_0_3px_rgb(255_255_255_/_0.05)]"
        }`}
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={props.disabled}
        aria-label={`Subtitle ${props.label.toLowerCase()} time`}
        aria-invalid={invalid}
        title={invalid ? "Use seconds, MM:SS.mmm, or HH:MM:SS.mmm" : undefined}
        spellCheck={false}
        onChange={(event) => {
          setInvalid(false);
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(formatSubtitleTimecode(props.seconds));
            setInvalid(false);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
