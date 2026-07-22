/**
 * Style tool: background category/style selection, custom background upload,
 * and video corner styling.
 */
import { Upload } from "lucide-react";
import { previewBackgrounds } from "../backgrounds";
import type { BackgroundCategory, BackgroundStyle, VideoCornerStyle } from "../types";

const backgroundCategories: Array<{
  id: BackgroundCategory;
  label: string;
  options: Array<{ id: BackgroundStyle; label: string }>;
}> = [
  {
    id: "image",
    label: "Image",
    options: [
      { id: "real-world-1", label: "Skyline" },
      { id: "real-world-2", label: "Cityscape" },
      { id: "real-world-3", label: "Coast" },
      { id: "real-world-4", label: "Florals" },
      { id: "real-world-5", label: "Chrome" },
      { id: "real-world-6", label: "Marble" }
    ]
  },
  {
    id: "gradient",
    label: "Gradient",
    options: [
      { id: "gradient-1", label: "Dawn" },
      { id: "gradient-2", label: "Silver" },
      { id: "gradient-3", label: "Ultraviolet" }
    ]
  }
];

/**
 * "Style" tool: pick the composition background (built-in swatches or a custom
 * uploaded image) and the corner rounding applied to the video frame.
 */
export function StylePanel(props: {
  activeCategory: BackgroundCategory;
  backgroundStyle: BackgroundStyle;
  videoCornerStyle: VideoCornerStyle;
  onCategoryChange: (category: BackgroundCategory) => void;
  onBackgroundStyleChange: (style: BackgroundStyle) => void;
  onUploadCustomBackground: () => void;
  onCornerStyleChange: (style: VideoCornerStyle) => void;
}) {
  // Older projects can still contain an animated background. Keep rendering
  // those projects, but present the supported Image category in the picker.
  const visibleCategory = props.activeCategory === "animated" ? "image" : props.activeCategory;

  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <div className="flex gap-2">
        {backgroundCategories.map((category) => (
          <button
            className={`editor-choice-button min-w-0 flex-1 rounded-full px-3 py-2 text-sm font-bold ${
              visibleCategory === category.id
                ? "bg-white/[0.08] text-white"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
            }`}
            type="button"
            key={category.id}
            aria-pressed={visibleCategory === category.id}
            onClick={() => props.onCategoryChange(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div
        className="editor-choice-content grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3"
        key={visibleCategory}
      >
        {backgroundCategories
          .find((category) => category.id === visibleCategory)
          ?.options.map((option) => (
            <button
              className={`editor-choice-button grid gap-2 rounded-lg border p-2 text-left text-xs font-extrabold ${
                props.backgroundStyle === option.id
                  ? "border-white bg-white/[0.1] text-white"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
              }`}
              type="button"
              key={option.id}
              aria-pressed={props.backgroundStyle === option.id}
              onClick={() => props.onBackgroundStyleChange(option.id)}
            >
              <span
                className="block h-14 rounded-md bg-white/[0.04]"
                style={{
                  backgroundImage: previewBackgrounds[option.id],
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              />
              <strong>{option.label}</strong>
            </button>
          ))}
      </div>
      <button
        className={`editor-choice-button inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-extrabold ${
          props.backgroundStyle === "custom"
            ? "border-white bg-white/[0.1] text-white"
            : "border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
        }`}
        type="button"
        aria-pressed={props.backgroundStyle === "custom"}
        onClick={props.onUploadCustomBackground}
      >
        <Upload size={16} />
        Upload custom background
      </button>
      <div className="grid gap-2">
        <span className="text-xs font-extrabold text-slate-400">Video corners</span>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
          {(["flat", "soft", "round"] as VideoCornerStyle[]).map((shape) => {
            return (
              <button
                className={`editor-choice-button rounded-md px-2 py-2 text-xs font-extrabold ${
                  props.videoCornerStyle === shape
                    ? "bg-white text-[#111827]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                type="button"
                key={shape}
                aria-pressed={props.videoCornerStyle === shape}
                onClick={() => props.onCornerStyleChange(shape)}
              >
                {shape === "flat" ? "Flat" : shape === "soft" ? "Slight" : "Rounded"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
