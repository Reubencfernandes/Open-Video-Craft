/**
 * Mic/camera footer control: enable toggle plus a device dropdown.
 */
import type { ReactNode } from "react";
import type { DeviceOption } from "./types";

export function FloatingDeviceControl(props: {
  enabled: boolean;
  enabledIcon: ReactNode;
  disabledIcon: ReactNode;
  enabledLabel: string;
  disabledLabel: string;
  accent: "mic" | "camera";
  options: DeviceOption[];
  value: string | null;
  disabled: boolean;
  onToggle: () => void;
  onValueChange: (value: string | null) => void;
}) {
  const enabledSurface = props.accent === "mic"
    ? "border-emerald-300/35 bg-emerald-500/10"
    : "border-cyan-300/35 bg-cyan-500/10";
  const iconColor = props.enabled
    ? props.accent === "mic" ? "text-emerald-300" : "text-cyan-300"
    : "text-rose-300";

  return (
    <div className={`grid min-h-16 place-items-center gap-1 rounded-lg border bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200 transition-colors ${props.enabled ? enabledSurface : "border-white/10"}`}>
      <button
        className="grid w-full min-w-0 place-items-center gap-1 border-0 bg-transparent text-inherit transition-transform duration-150 active:scale-[0.88] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
        type="button"
        onClick={props.onToggle}
        disabled={props.disabled}
      >
        <span className={`inline-flex min-h-7 items-center justify-center ${iconColor}`}>
          <span className="inline-flex transition-all duration-150">
            {props.enabled ? props.enabledIcon : props.disabledIcon}
          </span>
        </span>
        <span className="transition-opacity duration-150">
          {props.enabled ? props.enabledLabel : props.disabledLabel}
        </span>
      </button>
      {props.enabled && props.options.length > 1 ? (
        <select
          className="h-7 w-full min-w-0 rounded-md border border-white/10 bg-slate-950/80 px-1.5 text-[0.65rem] text-slate-100"
          value={props.value ?? ""}
          onChange={(event) => props.onValueChange(event.target.value || null)}
          disabled={props.disabled}
        >
          {props.options.map((option) => (
            <option key={option.deviceId} value={option.deviceId}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
