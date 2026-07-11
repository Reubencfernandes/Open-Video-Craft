/** Maps Electron updater states to the same card used by editor messages. */
import { useState } from "react";
import type { UpdateStatus } from "../../shared/types";
import { FloatingNotification } from "./FloatingNotification";

export function UpdateNotification(props: {
  status: UpdateStatus | null;
  onInstall: () => void;
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const status = props.status;
  if (!status || !["checking", "available", "downloading", "downloaded", "error"].includes(status.state)) return null;

  // Progress updates share one key so dismissing a download does not cause the
  // card to reappear for every percentage event.
  const key = `${status.state}:${status.latestVersion ?? "current"}`;
  if (dismissedKey === key) return null;

  const isError = status.state === "error";
  const title = status.state === "downloaded"
    ? "Update ready"
    : status.state === "checking"
      ? "Checking for updates"
      : isError
        ? "Update failed"
        : "Just a minute...";

  return (
    <FloatingNotification
      kind={isError ? "error" : "success"}
      title={title}
      message={status.message}
      progress={status.state === "downloading" ? status.downloadProgress : null}
      primaryAction={status.state === "downloaded" ? { label: "Restart", onClick: props.onInstall } : undefined}
      onDismiss={() => setDismissedKey(key)}
    />
  );
}
