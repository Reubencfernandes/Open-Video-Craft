/** Compact viewport-quality selector shown beside the playback controls. */
import { Monitor } from "lucide-react";
import type { PreviewQuality } from "./preview-quality";

export function PreviewQualityControl(props: {
  quality: PreviewQuality;
  onChange: (quality: PreviewQuality) => void;
}) {
  return (
    <div
      className="inline-flex flex-none items-center gap-1 rounded-lg border border-white/10 bg-black/65 p-1 text-[0.68rem] font-bold text-slate-300 shadow-lg backdrop-blur"
      aria-label="Viewport quality"
    >
      <Monitor size={13} className="mx-1 text-slate-400" aria-hidden="true" />
      {(["high", "low"] as const).map((quality) => (
        <button
          className={`rounded-md border-0 px-2 py-1 capitalize transition ${
            props.quality === quality
              ? "bg-white text-black"
              : "bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
          type="button"
          title={quality === "high" ? "Render the source-quality preview" : "Render a 640 px preview"}
          aria-pressed={props.quality === quality}
          key={quality}
          onClick={() => props.onChange(quality)}
        >
          {quality}
        </button>
      ))}
    </div>
  );
}
