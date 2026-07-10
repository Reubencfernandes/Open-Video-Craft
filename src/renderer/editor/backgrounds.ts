/**
 * Background style catalog for the Style tool.
 */
import type { BackgroundStyle } from "./types";

// Single source of truth for the built-in composition backgrounds. The Style
// panel swatches and the preview frame both render from this map, so the
// thumbnail always shows exactly what gets applied.
export const previewBackgrounds: Record<BackgroundStyle, string> = {
  "real-world-1":
    'linear-gradient(135deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.34)), url("https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=1170&auto=format&fit=crop")',
  "real-world-2":
    'linear-gradient(135deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.34)), url("https://images.unsplash.com/photo-1759681770982-313332e7f42c?q=80&w=1075&auto=format&fit=crop")',
  "real-world-3":
    'linear-gradient(135deg, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.34)), url("https://images.unsplash.com/photo-1567597714138-3bdc30f4f493?q=80&w=1170&auto=format&fit=crop")',
  "real-world-4":
    'linear-gradient(135deg, rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.2)), url("https://images.unsplash.com/photo-1635776062360-af423602aff3?q=80&w=1332&auto=format&fit=crop")',
  "real-world-5":
    'linear-gradient(135deg, rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.2)), url("https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?q=80&w=1332&auto=format&fit=crop")',
  "real-world-6":
    'linear-gradient(135deg, rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.2)), url("https://images.unsplash.com/photo-1554034483-04fda0d3507b?q=80&w=1170&auto=format&fit=crop")',
  "gradient-1": "linear-gradient(135deg, #8b5cf6, #ec4899)",
  "gradient-2": "linear-gradient(135deg, #06b6d4, #14b8a6)",
  "gradient-3": "linear-gradient(135deg, #f59e0b, #7c2d12)",
  "animated-1": "linear-gradient(120deg, #22d3ee, #6d28d9, #db2777)",
  "animated-2": "linear-gradient(120deg, #f59e0b, #ef4444, #7c3aed)",
  "animated-3": "linear-gradient(120deg, #0ea5e9, #14b8a6, #1e3a8a)",
  custom: ""
};
