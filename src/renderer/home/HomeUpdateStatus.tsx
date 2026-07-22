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
      className={`mb-3 grid min-w-0 gap-2.5 overflow-hidden rounded-xl border p-3 text-xs ${
        isError
          ? "border-rose-300/10 bg-rose-400/10 text-rose-100"
          : isReady
            ? "border-fuchsia-300/15 bg-[radial-gradient(circle_at_50%_100%,rgb(126_34_206_/_0.18),transparent_75%)] text-fuchsia-50"
            : "border-amber-200/10 bg-amber-300/[0.08] text-amber-100"
      }`}
      role="status"
      aria-live="polite"
      title={status.message}
    >
      <div className="flex min-w-0 items-center gap-2 font-semibold">
        <Icon className={isReady ? "text-fuchsia-300" : undefined} size={15} />
        <span className="min-w-0 flex-1 leading-4">{label}</span>
      </div>
      {isReady ? (
        <button
          className="home-update-restart-button"
          type="button"
          onClick={props.onInstall}
        >
          Restart
        </button>
      ) : null}
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
