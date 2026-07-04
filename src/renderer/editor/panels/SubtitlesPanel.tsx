import { Captions, WandSparkles } from "lucide-react";
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
    <div className="tool-stack">
      <button className="secondary-tool-button" type="button" onClick={props.onAddSubtitle}>
        <Captions size={16} />
        Add subtitle
      </button>
      <button
        className="secondary-tool-button"
        type="button"
        disabled={props.sttStatus === "loading" || props.sttStatus === "transcribing"}
        onClick={props.onGenerateSubtitles}
      >
        <WandSparkles size={16} />
        {props.sttStatus === "loading"
          ? "Loading model…"
          : props.sttStatus === "transcribing"
            ? "Transcribing…"
            : "Auto-generate (speech-to-text)"}
      </button>
      <div className="cut-hint">
        <WandSparkles size={14} />
        <span>
          Runs an open-source Whisper model on your device. The first run downloads the model
          (~40MB), then transcribes the recording's audio into subtitles.
        </span>
      </div>
      <div className="layout-control-group">
        <span>Subtitle style</span>
        <div className="segmented-control">
          {subtitleStyleOptions.map((option) => (
            <button
              className={props.subtitleStyle === option.id ? "segmented-active" : ""}
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
        <div className="subtitle-editor">
          <textarea
            value={selected.text}
            onChange={(event) => props.onUpdateSubtitle(selected.id, { text: event.target.value })}
          />
          <div className="time-input-grid">
            <label>
              <span>Start</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={selected.start}
                onChange={(event) =>
                  props.onUpdateSubtitle(selected.id, { start: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>End</span>
              <input
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
        <div className="tool-empty">No subtitles</div>
      )}
      <div className="tool-list">
        {props.subtitles.map((subtitle) => (
          <button
            className={`tool-list-item ${
              selected?.id === subtitle.id ? "tool-list-item-active" : ""
            }`}
            type="button"
            key={subtitle.id}
            onClick={() => props.onSelectSubtitle(subtitle.id)}
          >
            <Captions size={15} />
            <span>{subtitle.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
