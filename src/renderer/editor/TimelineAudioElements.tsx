/**
 * Hidden audio media elements used by the timeline playback synchronizer.
 * Visual waveform rendering is intentionally handled by BezierAudioWaveform.
 */
import type { MutableRefObject } from "react";
import type { TimelineMediaClip } from "./types";

export function TimelineAudioElements(props: {
  clips: TimelineMediaClip[];
  elementsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  onMediaDuration: (itemId: string, duration: number | null) => void;
}) {
  return (
    <div className="hidden" aria-hidden="true">
      {props.clips.map((clip) => (
        <audio
          key={clip.id}
          src={clip.item.url}
          preload="metadata"
          onLoadedMetadata={(event) => props.onMediaDuration(clip.item.id, event.currentTarget.duration)}
          ref={(element) => {
            // The playback hook addresses audio elements by timeline clip id.
            if (element) props.elementsRef.current.set(clip.id, element);
            else props.elementsRef.current.delete(clip.id);
          }}
        />
      ))}
    </div>
  );
}
