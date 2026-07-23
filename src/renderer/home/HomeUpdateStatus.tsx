/** Responsive launcher update progress and restart transition. */
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { UpdateStatus } from "../../shared/types";

const downloadExitDuration = 280;

export function HomeUpdateStatus(props: {
  status: UpdateStatus | null;
  onInstall: () => void;
}) {
  const status = props.status;
  const state = status?.state ?? "idle";
  const [showRestart, setShowRestart] = useState(state === "downloaded");
  const [downloadExiting, setDownloadExiting] = useState(false);

  useEffect(() => {
    if (state !== "downloaded") {
      setShowRestart(false);
      setDownloadExiting(false);
      return;
    }
    if (showRestart) return;

    setDownloadExiting(true);
    const timer = window.setTimeout(() => {
      setDownloadExiting(false);
      setShowRestart(true);
    }, downloadExitDuration);
    return () => window.clearTimeout(timer);
  }, [showRestart, state]);

  if (!status || !["available", "downloading", "downloaded", "error"].includes(state)) {
    return null;
  }

  if (state === "error") {
    return (
      <div
        className="mb-3 flex min-w-0 items-start gap-2 rounded-xl bg-rose-400/10 p-3 text-xs text-rose-100"
        role="status"
        aria-live="polite"
        title={status.message}
      >
        <AlertTriangle className="mt-0.5 shrink-0 text-rose-300" size={15} />
        <span className="min-w-0 leading-4">Update check failed</span>
      </div>
    );
  }

  if (showRestart) {
    return (
      <div
        className="home-update-restart-stage mb-3 min-w-0"
        role="status"
        aria-live="polite"
        title={status.message}
      >
        <button
          className="home-update-restart-button"
          type="button"
          onClick={props.onInstall}
        >
          <RefreshCw className="relative z-[2] shrink-0" size={17} strokeWidth={2} />
          <span className="relative z-[2] truncate">Restart</span>
        </button>
      </div>
    );
  }

  const progress = state === "downloaded"
    ? 100
    : Math.max(0, Math.min(100, status.downloadProgress ?? 0));

  return (
    <div
      className={`home-update-download-card mb-3 grid min-w-0 gap-3 overflow-hidden rounded-2xl bg-black p-3.5 text-white shadow-[0_12px_30px_rgb(0_0_0_/_0.32)] ${
        downloadExiting ? "home-update-download-card-exit" : ""
      }`}
      role="status"
      aria-live="polite"
      title={status.message}
      data-update-download-state={downloadExiting ? "exiting" : "active"}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Download className="shrink-0 text-white" size={18} strokeWidth={1.8} />
        <span className="min-w-0 truncate text-[0.72rem] font-medium tracking-[-0.01em] text-neutral-100">
          Download in progress
        </span>
      </div>

      <div className="grid min-w-0 gap-2">
        <span className="text-[0.67rem] font-medium tabular-nums text-neutral-300">
          {Math.round(progress)}% complete
        </span>
        <span
          className="home-update-progress-track relative block h-3 min-w-0 overflow-hidden rounded-full bg-[#56565a]"
          role="progressbar"
          aria-label="Update download progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span
            className="home-update-progress-fill absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </span>
      </div>
    </div>
  );
}
