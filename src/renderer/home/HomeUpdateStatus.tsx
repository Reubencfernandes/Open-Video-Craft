/** Persistent launcher status for an available or downloading app update. */
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "../../shared/types";

export function HomeUpdateStatus(props: {
  status: UpdateStatus | null;
  onInstall: () => void;
}) {
  const status = props.status;
  if (!status || !["available", "downloading", "downloaded", "error"].includes(status.state)) {
    return null;
  }

  const isError = status.state === "error";
  const isReady = status.state === "downloaded";
  const Icon = isError ? AlertTriangle : isReady ? RefreshCw : Download;
  const label = isError
    ? "Update check failed"
    : isReady
      ? `Version ${status.latestVersion ?? "latest"} is ready`
      : status.state === "downloading"
        ? `Downloading ${Math.round(status.downloadProgress ?? 0)}%`
        : `Version ${status.latestVersion ?? "latest"} available`;

  return (
    <div
      className={`mb-3 grid gap-2 rounded-xl p-3 text-xs ${
        isError
          ? "bg-rose-400/10 text-rose-100"
          : "bg-amber-300/10 text-amber-100"
      }`}
      role="status"
      aria-live="polite"
      title={status.message}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon size={15} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isReady ? (
          <button
            className="rounded-lg bg-white px-2.5 py-1 font-bold text-black hover:bg-slate-200"
            type="button"
            onClick={props.onInstall}
          >
            Restart
          </button>
        ) : null}
      </div>
      {status.state === "downloading" ? (
        <span className="h-1.5 overflow-hidden rounded-full bg-black/25">
          <span
            className="block h-full rounded-full bg-amber-300 transition-[width]"
            style={{ width: `${Math.max(0, Math.min(100, status.downloadProgress ?? 0))}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}
