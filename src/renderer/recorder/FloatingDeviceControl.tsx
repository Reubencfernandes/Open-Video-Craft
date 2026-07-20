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
  options: DeviceOption[];
  value: string | null;
  disabled: boolean;
  onToggle: () => void;
  onValueChange: (value: string | null) => void;
}) {
  const enabledSurface = "bg-[#ff3b9d]/10 text-white";
  const iconColor = props.enabled ? "text-[#ff6db7]" : "text-neutral-500";

  return (
    <div className={`grid min-h-16 place-items-center gap-1 rounded-xl border-0 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-neutral-300 transition-[transform,background-color,color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08] ${props.enabled ? enabledSurface : ""}`}>
      <button
        className="grid w-full min-w-0 place-items-center gap-1 border-0 bg-transparent text-inherit transition-transform duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
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
          className="themed-select h-7 w-full min-w-0 rounded-md border-0 bg-black/30 px-1.5 text-[0.65rem] text-white outline-none"
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
