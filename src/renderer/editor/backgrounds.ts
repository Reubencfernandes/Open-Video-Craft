/**
 * Background style catalog for the Style tool.
 */
import type { BackgroundStyle } from "./types";
import sceneSkyline from "../assets/backgrounds/scene-skyline.jpg";
import sceneCityscape from "../assets/backgrounds/scene-cityscape.jpg";
import sceneCoast from "../assets/backgrounds/scene-coast.jpg";
import realWorld4 from "../assets/backgrounds/real-world-4.svg";
import realWorld5 from "../assets/backgrounds/real-world-5.svg";
import realWorld6 from "../assets/backgrounds/real-world-6.svg";

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
  "real-world-4": localScene(realWorld4, "rgb(0 0 0 / 0.2)"),
  "real-world-5": localScene(realWorld5, "rgb(0 0 0 / 0.2)"),
  "real-world-6": localScene(realWorld6, "rgb(0 0 0 / 0.2)"),
  "gradient-1": "linear-gradient(135deg, #8b5cf6, #ec4899)",
  "gradient-2": "linear-gradient(135deg, #06b6d4, #14b8a6)",
  "gradient-3": "linear-gradient(135deg, #f59e0b, #7c2d12)",
  "animated-1": "linear-gradient(120deg, #22d3ee, #6d28d9, #db2777)",
  "animated-2": "linear-gradient(120deg, #f59e0b, #ef4444, #7c3aed)",
  "animated-3": "linear-gradient(120deg, #0ea5e9, #14b8a6, #1e3a8a)",
  custom: ""
};
