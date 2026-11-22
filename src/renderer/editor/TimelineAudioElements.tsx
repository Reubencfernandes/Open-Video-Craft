/**
 * Hidden audio media elements used by the timeline playback synchronizer.
 * Visual waveform rendering is intentionally handled by BezierAudioWaveform.
 */
import type { MutableRefObject } from "react";
import type { TimelineMediaClip } from "./types";

export function TimelineAudioElements(props: {
  clips: TimelineMediaClip[];
  cleanupClips?: ReadonlyArray<{ id: string; url: string }>;
  elementsRef: MutableRefObject<Map<string, HTMLAudioElement>>;
  onMediaDuration: (itemId: string, duration: number | null) => void;
}) {
  return (
    <div className="hidden" aria-hidden="true">
      {(props.cleanupClips ?? []).map((clip) => (
        <audio
          key={`cleanup:${clip.id}`}
          src={clip.url}
          crossOrigin="anonymous"
          preload="metadata"
          ref={(element) => {
            if (element) props.elementsRef.current.set(`cleanup:${clip.id}`, element);
            else props.elementsRef.current.delete(`cleanup:${clip.id}`);
          }}
        />
      ))}
      {props.clips.map((clip) => (
        <audio
          key={clip.id}
          src={clip.item.url}
          // Cross-origin ovc-* media must be CORS-anonymous or the WebAudio meter
          // graph (audio-meter.ts) is tainted and plays silence. See PreviewContent.
          crossOrigin="anonymous"
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
