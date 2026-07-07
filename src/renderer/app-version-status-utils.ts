import type { UpdateStatus, UpdateStatusState } from "../shared/types";

export function formatUpdateStatus(status: UpdateStatus | null): string {
  if (!status) {
    return "Reading update status...";
  }

  switch (status.state) {
    case "disabled":
      return "Updates in installed app";
    case "checking":
      return "Checking for updates...";
    case "available":
      return status.latestVersion ? `Update ${status.latestVersion} found` : "Update found";
    case "downloading":
      return typeof status.downloadProgress === "number"
        ? `Downloading ${Math.round(status.downloadProgress)}%`
        : "Downloading update";
    case "downloaded":
      return status.latestVersion ? `Update ${status.latestVersion} ready` : "Update ready";
    case "not-available":
      return "Up to date";
    case "error":
      return "Update check failed";
    case "idle":
    default:
      return "Update status pending";
  }
}

export function getUpdateStatusColor(state: UpdateStatusState): string {
  switch (state) {
    case "not-available":
      return "text-emerald-300";
    case "available":
    case "downloading":
    case "downloaded":
      return "text-cyan-300";
    case "error":
      return "text-amber-300";
    case "checking":
      return "text-sky-300";
    case "disabled":
    case "idle":
    default:
      return "text-slate-400";
  }
}
