import { Upload } from "lucide-react";
import type { BackgroundCategory, BackgroundStyle, VideoCornerStyle } from "../types";

const backgroundCategories: Array<{
  id: BackgroundCategory;
  label: string;
  options: Array<{ id: BackgroundStyle; label: string }>;
}> = [
  {
    id: "animated",
    label: "Animated",
    options: [
      { id: "animated-1", label: "Aurora" },
      { id: "animated-2", label: "Sunset" },
      { id: "animated-3", label: "Ocean" }
    ]
  },
  {
    id: "image",
    label: "Image",
    options: [
      { id: "real-world-1", label: "Desk" },
      { id: "real-world-2", label: "Studio" },
      { id: "real-world-3", label: "Nature" }
    ]
  },
  {
    id: "gradient",
    label: "Gradient",
    options: [
      { id: "gradient-1", label: "Violet" },
      { id: "gradient-2", label: "Teal" },
      { id: "gradient-3", label: "Ember" }
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
  return (
    <div className="tool-stack">
      <div className="media-tabs">
        {backgroundCategories.map((category) => (
          <button
            className={props.activeCategory === category.id ? "media-tab-active" : ""}
            type="button"
            key={category.id}
            onClick={() => props.onCategoryChange(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="style-grid">
        {backgroundCategories
          .find((category) => category.id === props.activeCategory)
          ?.options.map((option) => (
            <button
              className={`style-swatch style-swatch-${option.id} ${
                props.backgroundStyle === option.id ? "style-swatch-active" : ""
              }`}
              type="button"
              key={option.id}
              onClick={() => props.onBackgroundStyleChange(option.id)}
            >
              <span />
              <strong>{option.label}</strong>
            </button>
          ))}
      </div>
      <button
        className={`secondary-tool-button ${
          props.backgroundStyle === "custom" ? "tool-option-active" : ""
        }`}
        type="button"
        onClick={props.onUploadCustomBackground}
      >
        <Upload size={16} />
        Upload custom background
      </button>
      <div className="layout-control-group">
        <span>Video corners</span>
        <div className="segmented-control">
          {(["flat", "soft", "round"] as VideoCornerStyle[]).map((shape) => (
            <button
              className={props.videoCornerStyle === shape ? "segmented-active" : ""}
              type="button"
              key={shape}
              onClick={() => props.onCornerStyleChange(shape)}
            >
              {shape === "flat" ? "Flat" : shape === "soft" ? "Slight" : "Full"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
