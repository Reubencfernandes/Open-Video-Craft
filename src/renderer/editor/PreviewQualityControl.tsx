/** Compact viewport-quality selector shown in the preview header. */
import { Monitor } from "lucide-react";
import type { PreviewQuality } from "./preview-quality";

export function PreviewQualityControl(props: {
  quality: PreviewQuality;
  onChange: (quality: PreviewQuality) => void;
}) {
  return (
    <div
      className="inline-flex flex-none items-center gap-0.5 rounded-lg bg-white/[0.07] p-1 text-[0.68rem] font-semibold text-neutral-300"
      aria-label="Viewport quality"
    >
      <Monitor size={13} className="mx-1 text-neutral-400" aria-hidden="true" />
      {(["high", "low"] as const).map((quality) => (
        <button
          className={`editor-choice-button rounded-md border-0 px-2 py-1 capitalize ${
            props.quality === quality
              ? "bg-white/[0.16] text-white"
              : "bg-transparent text-neutral-400 hover:bg-white/[0.08] hover:text-white"
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
