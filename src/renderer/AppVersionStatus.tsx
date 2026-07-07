import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import type { UpdateStatusState } from "../shared/types";
import {
  formatUpdateStatus,
  getUpdateStatusColor
} from "./app-version-status-utils";
import { cx } from "./classNames";
import { useAppUpdateStatus } from "./useAppUpdateStatus";

interface AppVersionStatusProps {
  className?: string;
}

export function AppVersionStatus({ className }: AppVersionStatusProps) {
  const {
    appInfo,
    updateStatus,
    checking,
    installing,
    checkForUpdates,
    installUpdate
  } = useAppUpdateStatus();

  const versionLabel = appInfo?.version ?? updateStatus?.currentVersion ?? "unknown";
  const state = updateStatus?.state ?? "idle";
  const statusText = formatUpdateStatus(updateStatus);
  const Icon = getUpdateStatusIcon(state);
  const canCheck =
    Boolean(updateStatus?.isPackaged) &&
    !checking &&
    state !== "checking" &&
    state !== "downloading" &&
    state !== "downloaded";
  const canInstall = state === "downloaded" && !installing;

  return (
    <div
      className={cx(
        "fixed bottom-3 left-3 z-[80] flex max-w-[min(34rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-white/10 bg-[#111216]/95 px-3 py-2 text-xs font-extrabold text-slate-200 shadow-[0_14px_34px_rgb(0_0_0_/_0.38)] backdrop-blur",
        className
      )}
      role="status"
      aria-live="polite"
      title={updateStatus?.message ?? "App version and update status"}
    >
      <span className="shrink-0 text-slate-400">v{versionLabel}</span>
      <span className="h-1 w-1 shrink-0 rounded-full bg-slate-600" />
      <Icon className={cx("shrink-0", getUpdateStatusColor(state))} size={14} />
      <span className="min-w-0 truncate text-slate-300">{statusText}</span>

      {canInstall ? (
        <button
          className="ml-1 shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[0.68rem] font-extrabold text-cyan-100 hover:bg-cyan-300/18"
          type="button"
          onClick={() => void installUpdate()}
        >
          Restart
        </button>
      ) : updateStatus?.isPackaged ? (
        <button
          className="ml-1 shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[0.68rem] font-extrabold text-slate-200 hover:bg-white/10 disabled:cursor-wait disabled:opacity-45"
          type="button"
          disabled={!canCheck}
          onClick={() => void checkForUpdates()}
        >
          {checking || state === "checking" ? "Checking" : "Check"}
        </button>
      ) : null}
    </div>
  );
}

function getUpdateStatusIcon(state: UpdateStatusState) {
  switch (state) {
    case "not-available":
      return CheckCircle2;
    case "available":
    case "downloading":
    case "downloaded":
      return Download;
    case "error":
      return AlertTriangle;
    case "checking":
    case "disabled":
    case "idle":
    default:
      return RefreshCw;
  }
}
