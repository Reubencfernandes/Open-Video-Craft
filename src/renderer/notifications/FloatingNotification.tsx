/**
 * Compact bottom-right notification shared by launcher and editor errors/status.
 * Error text remains fully visible and can be copied for bug reports.
 */
import { Check, CheckCircle2, Clipboard, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type FloatingNotificationKind = "success" | "error";

export function FloatingNotification(props: {
  kind: FloatingNotificationKind;
  title: string;
  message: string;
  onDismiss: () => void;
  progress?: number | null;
  primaryAction?: { label: string; onClick: () => void };
}) {
  const [copied, setCopied] = useState(false);
  const isError = props.kind === "error";
  const StatusIcon = isError ? XCircle : CheckCircle2;

  // A new message must never inherit the previous card's copied state.
  useEffect(() => setCopied(false), [props.message]);

  async function copyError() {
    const didCopy = await copyText(props.message);
    setCopied(didCopy);
  }

  return (
    <section
      className={`notification-surface notification-surface--${props.kind} fixed bottom-4 right-4 z-[70] w-[min(27rem,calc(100vw-2rem))] overflow-hidden rounded-2xl px-6 py-5 text-white shadow-[0_20px_55px_rgb(0_0_0_/_0.58)] backdrop-blur-xl`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <button className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-lg text-slate-300 hover:bg-white/[0.07] hover:text-white" type="button" aria-label="Dismiss notification" onClick={props.onDismiss}>
        <X size={16} />
      </button>

      <div className="relative flex items-center gap-5 pr-5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full border-2 ${isError ? "border-rose-400 text-rose-300" : "border-emerald-400 text-emerald-300"}`}>
          <StatusIcon size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[0.92rem] font-semibold">{props.title}</h2>
          <p className="m-0 mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[0.78rem] leading-5 text-slate-300" data-selectable="true">{props.message}</p>
          {typeof props.progress === "number" ? (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3">
              <span className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, props.progress))}%` }} /></span>
              <span className="text-right text-[0.68rem] font-semibold tabular-nums text-slate-300">{Math.round(props.progress)}%</span>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {isError ? (
              <button className="inline-flex min-h-9 min-w-28 items-center justify-center gap-2 rounded-md bg-white/[0.07] px-4 text-xs font-medium text-white hover:bg-white/[0.12]" type="button" onClick={() => void copyError()}>
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? "Error copied" : "Copy error"}
              </button>
            ) : null}
            {props.primaryAction ? <button className="min-h-9 min-w-24 rounded-md bg-white/[0.1] px-4 text-xs font-medium text-white hover:bg-white/[0.16]" type="button" onClick={props.primaryAction.onClick}>{props.primaryAction.label}</button> : null}
            <button className="min-h-9 min-w-24 rounded-md bg-white/[0.06] px-4 text-xs font-medium text-slate-200 hover:bg-white/[0.1]" type="button" onClick={props.onDismiss}>
              {isError ? "Dismiss" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Electron builds without Clipboard API support still get a DOM fallback.
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}
