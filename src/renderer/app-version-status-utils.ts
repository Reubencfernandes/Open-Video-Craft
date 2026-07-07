import type { UpdateStatus, UpdateStatusState } from "../shared/types";

export function formatUpdateStatus(status: UpdateStatus | null): string {
  if (!status) {
    return "Reading update status...";
  }

  switch (status.state) {
    case "disabled":
      return status.message || "Only available in the installed app";
    case "checking":
      return "Checking for updates...";
    case "available":
      return status.latestVersion ? `Update ${status.latestVersion} found` : "Update found";
    case "downloading":
      return typeof status.downloadProgress === "number"
        ? `Downloading ${Math.round(status.downloadProgress)}%`
        : "Downloading update";
    case "downloaded":
      return status.latestVersion ? `Update ${status.latestVersion} ready to restart` : "Ready to restart";
    case "not-available":
      return "Up to date";
    case "error":
      return status.message || "Update check failed";
    case "idle":
    default:
      return status.message || "Will check for updates shortly";
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
