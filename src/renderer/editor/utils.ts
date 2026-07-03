import { frameRate } from "./types";

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function createTimelineTicks(duration: number): string[] {
  const safeDuration = Math.max(duration, 1);
  const tickCount = 6;

  return Array.from({ length: tickCount }, (_value, index) =>
    formatTimelineTick((safeDuration / (tickCount - 1)) * index, safeDuration)
  );
}

function formatTimelineTick(seconds: number, duration: number): string {
  if (duration < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  return formatSeconds(seconds);
}

export function formatTimecode(seconds: number, frame: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00:00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  const remainingFrames = Math.max(0, frame % frameRate);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}:${String(remainingFrames).padStart(2, "0")}`;
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
