/**
 * Background style catalog for the Style tool.
 */
import type { BackgroundStyle } from "./types";
import sceneSkyline from "../assets/backgrounds/scene-skyline.jpg";
import sceneCityscape from "../assets/backgrounds/scene-cityscape.jpg";
import sceneCoast from "../assets/backgrounds/scene-coast.jpg";
import styleFlorals from "../assets/backgrounds/style-florals.jpg";
import styleChrome from "../assets/backgrounds/style-chrome.jpg";
import styleMarble from "../assets/backgrounds/style-marble.jpg";
import gradientDawn from "../assets/backgrounds/gradient-dawn.jpg";
import gradientSilver from "../assets/backgrounds/gradient-silver.jpg";
import gradientUltraviolet from "../assets/backgrounds/gradient-ultraviolet.jpg";

function localScene(url: string, shade = "rgb(0 0 0 / 0.34)"): string {
  return `linear-gradient(135deg, rgb(0 0 0 / 0.08), ${shade}), url("${url}")`;
}

// Single source of truth for the built-in composition backgrounds. The Style
// panel swatches and the preview frame both render from this map, so the
// thumbnail always shows exactly what gets applied.
export const previewBackgrounds: Record<BackgroundStyle, string> = {
  "real-world-1": localScene(sceneSkyline),
  "real-world-2": localScene(sceneCityscape),
  "real-world-3": localScene(sceneCoast),
  "real-world-4": localScene(styleFlorals, "rgb(0 0 0 / 0.2)"),
  "real-world-5": localScene(styleChrome, "rgb(0 0 0 / 0.2)"),
  "real-world-6": localScene(styleMarble, "rgb(0 0 0 / 0.2)"),
  "gradient-1": `url("${gradientDawn}")`,
  "gradient-2": `url("${gradientSilver}")`,
  "gradient-3": `url("${gradientUltraviolet}")`,
  "animated-1": "linear-gradient(120deg, #22d3ee, #6d28d9, #db2777)",
  "animated-2": "linear-gradient(120deg, #f59e0b, #ef4444, #7c3aed)",
  "animated-3": "linear-gradient(120deg, #0ea5e9, #14b8a6, #1e3a8a)",
  custom: ""
};
