import {
  ArrowUp,
  Camera,
  CheckCircle2,
  ExternalLink,
  Mic,
  MonitorUp,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import type {
  DesktopPermissionKind,
  DesktopPermissionState,
  DesktopPermissionStatus
} from "../shared/types";
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

type MediaPermissionKind = Extract<DesktopPermissionKind, "camera" | "microphone">;

interface PermissionOnboardingProps {
  loading: boolean;
  status: DesktopPermissionStatus | null;
  onOpenSettings: (kind: DesktopPermissionKind) => void;
  onRefresh: () => void;
  onRequestMedia: (kind: MediaPermissionKind) => void;
  onStartAppDrag: () => void;
}

const permissionLabels: Record<DesktopPermissionKind, string> = {
  screen: "Screen Recording",
  camera: "Camera",
  microphone: "Microphone"
};

const permissionHelp: Record<DesktopPermissionKind, string> = {
  screen: "Required before screen or window sources can appear.",
  camera: "Required when recording a face camera track.",
  microphone: "Required when recording microphone audio."
};

const permissionIcons = {
  screen: MonitorUp,
  camera: Camera,
  microphone: Mic
};

export function PermissionOnboarding({
  loading,
  status,
  onOpenSettings,
  onRefresh,
  onRequestMedia,
  onStartAppDrag
}: PermissionOnboardingProps) {
  if (!status || status.platform !== "darwin" || !hasPendingPermission(status)) {
    return null;
  }

  const rows = getPermissionRows(status);

  return (
    <section className="grid gap-4 rounded-[10px] border border-sky-300/20 bg-sky-300/[0.07] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-300/15 text-sky-100">
            <ShieldAlert size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-base font-extrabold text-white">macOS permissions</h2>
            <p className="m-0 mt-1 max-w-[48rem] text-sm font-semibold leading-5 text-slate-300">
              Allow Screen Recording in System Settings, then restart Open Video Craft.
            </p>
          </div>
        </div>
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh permissions"
        >
          <RefreshCw className={cx(loading && "animate-spin")} size={16} />
        </button>
      </div>

      {status.canDragAppBundle ? (
        <div
          className="grid cursor-grab grid-cols-[auto_1fr] items-center gap-3 rounded-[10px] border border-white/12 bg-[#14181f] p-3 active:cursor-grabbing"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", "Open Video Craft");
            onStartAppDrag();
          }}
          title="Drag Open Video Craft into the macOS privacy list"
        >
          <span className="grid size-11 place-items-center rounded-lg bg-white/10 text-sky-100">
            <ArrowUp size={25} />
          </span>
          <div className="flex min-w-0 items-center gap-3">
            <img className="size-9 shrink-0 rounded-lg object-contain" src={appLogo} alt="" />
            <strong className="truncate text-sm text-white">
              Drag Open Video Craft to the list above if it is missing.
            </strong>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        {rows.map((row) => (
          <PermissionRow
            key={row.kind}
            kind={row.kind}
            state={row.state}
            onOpenSettings={onOpenSettings}
            onRequestMedia={onRequestMedia}
          />
        ))}
      </div>
    </section>
  );
}

function PermissionRow({
  kind,
  state,
  onOpenSettings,
  onRequestMedia
}: {
  kind: DesktopPermissionKind;
  state: DesktopPermissionState;
  onOpenSettings: (kind: DesktopPermissionKind) => void;
  onRequestMedia: (kind: MediaPermissionKind) => void;
}) {
  const Icon = permissionIcons[kind];
  const granted = state === "granted";
  const canRequest = kind !== "screen" && state === "not-determined";

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2.5">
      <span className="grid size-9 place-items-center rounded-lg bg-white/[0.06] text-slate-200">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm text-white">{permissionLabels[kind]}</strong>
          <span
            className={cx(
              "shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold uppercase",
              granted ? "bg-emerald-400/15 text-emerald-100" : "bg-amber-300/15 text-amber-100"
            )}
          >
            {formatPermissionState(state)}
          </span>
        </div>
        <p className="m-0 mt-0.5 truncate text-xs font-semibold text-slate-400">
          {permissionHelp[kind]}
        </p>
      </div>
      {granted ? (
        <CheckCircle2 className="text-emerald-200" size={18} />
      ) : (
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-extrabold text-slate-100 hover:bg-white/10"
          type="button"
          onClick={() => (canRequest ? onRequestMedia(kind) : onOpenSettings(kind))}
        >
          {canRequest ? "Allow" : "Settings"}
          <ExternalLink size={13} />
        </button>
      )}
    </div>
  );
}

function getPermissionRows(status: DesktopPermissionStatus) {
  return (["screen", "camera", "microphone"] as const).map((kind) => ({
    kind,
    state: status[kind]
  }));
}

function hasPendingPermission(status: DesktopPermissionStatus): boolean {
  return getPermissionRows(status).some(
    ({ state }) => state !== "granted" && state !== "unavailable"
  );
}

function formatPermissionState(state: DesktopPermissionState): string {
  return state.replace("-", " ");
}
