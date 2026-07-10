/**
 * Mic/camera footer control: enable toggle plus a device dropdown.
 */
import { AnimatePresence, motion } from "framer-motion";
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
  return (
    <div className="grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200">
      <motion.button
        className="grid w-full min-w-0 place-items-center gap-1 border-0 bg-transparent text-inherit disabled:cursor-not-allowed disabled:opacity-45"
        type="button"
        onClick={props.onToggle}
        disabled={props.disabled}
        whileTap={props.disabled ? undefined : { scale: 0.88 }}
        transition={{ type: "spring", stiffness: 520, damping: 28 }}
      >
        <span className="inline-flex min-h-7 items-center justify-center text-cyan-300">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={props.enabled ? "on" : "off"}
              initial={{ opacity: 0, scale: 0.5, rotate: -18 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 18 }}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
              style={{ display: "inline-flex" }}
            >
              {props.enabled ? props.enabledIcon : props.disabledIcon}
            </motion.span>
          </AnimatePresence>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={props.enabled ? props.enabledLabel : props.disabledLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {props.enabled ? props.enabledLabel : props.disabledLabel}
          </motion.span>
        </AnimatePresence>
      </motion.button>
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
