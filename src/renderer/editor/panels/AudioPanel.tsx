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
    <div className="tool-stack">
      <RangeControl
        label="Master volume"
        min={0}
        max={200}
        value={props.masterVolume}
        suffix="%"
        onChange={props.onMasterVolumeChange}
      />
      <button className="secondary-tool-button" type="button" onClick={props.onAddBackgroundMusic}>
        <Music2 size={16} />
        Add background music
      </button>
      <div className="audio-source-list">
        {props.audioSources.map((item) => {
          const level = props.audioLevels[item.id] ?? { volume: 100, muted: false };
          return (
            <div
              className={`audio-source ${level.muted ? "audio-source-muted" : ""}`}
              key={item.id}
            >
              <div className="audio-source-head">
                <button
                  className="audio-source-name"
                  type="button"
                  onClick={() => props.onSelectItem(item.id)}
                >
                  <AudioLines size={14} />
                  <span>{item.name}</span>
                </button>
                <output>{level.volume}%</output>
                <button
                  className="audio-source-mute"
                  type="button"
                  title={level.muted ? "Unmute" : "Mute"}
                  onClick={() => props.onSetAudioLevel(item.id, { muted: !level.muted })}
                >
                  {level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
              <input
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
          <div className="tool-empty">Record with a mic or add music to control audio</div>
        ) : null}
      </div>
    </div>
  );
}
