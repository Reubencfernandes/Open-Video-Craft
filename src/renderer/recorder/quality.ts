/**
 * Capture-quality presets for the recorder: screen encode resolution/bitrate
 * and camera capture resolution. Kept in one place so the picker UI and the
 * capture pipeline stay in agreement.
 */
export type ScreenQuality = "source" | "1440p" | "1080p" | "720p";
export type CameraQuality = "1080p" | "720p" | "480p";

export const screenQualities: ScreenQuality[] = ["source", "1440p", "1080p", "720p"];
export const cameraQualities: CameraQuality[] = ["1080p", "720p", "480p"];

// `maxHeight: null` keeps the display's native resolution — i.e. the full
// screen at full quality; the lower tiers downscale to shrink the file.
export const screenQualityPresets: Record<
  ScreenQuality,
  { label: string; maxHeight: number | null; videoBitsPerSecond: number }
> = {
  source: { label: "Native (full)", maxHeight: null, videoBitsPerSecond: 24_000_000 },
  "1440p": { label: "1440p", maxHeight: 1440, videoBitsPerSecond: 16_000_000 },
  "1080p": { label: "1080p", maxHeight: 1080, videoBitsPerSecond: 8_000_000 },
  "720p": { label: "720p", maxHeight: 720, videoBitsPerSecond: 4_000_000 }
};

export const cameraQualityPresets: Record<
  CameraQuality,
  { label: string; width: number; height: number }
> = {
  "1080p": { label: "1080p", width: 1920, height: 1080 },
  "720p": { label: "720p", width: 1280, height: 720 },
  "480p": { label: "480p", width: 854, height: 480 }
};
