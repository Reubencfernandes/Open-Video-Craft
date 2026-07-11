/** Presentation-only formatting helpers shared by project cards and rows. */
import type { ProjectLibraryEntry } from "../../shared/types";

export function formatProjectUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 60) return `Edited ${elapsedMinutes} min ago`;
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return `Edited ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Edited ${days} ${days === 1 ? "day" : "days"} ago`;
}

export function formatProjectDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return "00:00";
  const totalSeconds = Math.round(durationMs / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function formatMediaAvailability(project: ProjectLibraryEntry) {
  const media = [project.mediaAvailability.screen && "screen", project.mediaAvailability.camera && "camera", project.mediaAvailability.audio && "audio"].filter(Boolean);
  return media.length > 0 ? media.join(" · ") : "no media";
}
