/**
 * Bottom-left version/update pill shown in every window.
 */
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
    state !== "disabled" &&
    state !== "checking" &&
    state !== "downloading" &&
    state !== "downloaded";
  const canInstall = state === "downloaded" && !installing;

  return (
    <div
      className={cx(
        "fixed bottom-3 left-1/2 z-[80] flex w-fit max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#111216]/95 px-3 py-2 text-xs font-extrabold text-slate-200 shadow-[0_14px_34px_rgb(0_0_0_/_0.38)] backdrop-blur",
        className
      )}
      role="status"
      aria-live="polite"
      title={updateStatus?.message ?? "App version and update status"}
    >
      <span className="shrink-0 text-slate-400">v{versionLabel}</span>
      <span className="h-1 w-1 shrink-0 rounded-full bg-slate-600" />
      <Icon className={cx("shrink-0", getUpdateStatusColor(state))} size={14} />
      <span className="shrink-0 text-slate-500">Updates:</span>
      <span className="min-w-0 flex-1 truncate text-slate-300">{statusText}</span>
      {state === "downloading" && typeof updateStatus?.downloadProgress === "number" ? (
        <span className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-white/10">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-cyan-300"
            style={{
              width: `${Math.max(0, Math.min(100, updateStatus.downloadProgress))}%`
            }}
          />
        </span>
      ) : null}

      {canInstall ? (
        <button
          className="relative isolate ml-1 inline-flex shrink-0 overflow-hidden rounded-full border border-white/80 bg-gradient-to-br from-fuchsia-300 via-violet-500 to-fuchsia-600 px-3 py-1.5 text-[0.68rem] font-extrabold text-white shadow-[0_0_0_3px_#08080c,0_0_0_5px_rgb(217_70_239_/_0.34),0_8px_18px_rgb(126_34_206_/_0.42)] transition duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-white/30 before:content-[''] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200/90 disabled:cursor-wait disabled:opacity-50"
          type="button"
          onClick={() => void installUpdate()}
        >
          <span className="relative">Restart</span>
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
