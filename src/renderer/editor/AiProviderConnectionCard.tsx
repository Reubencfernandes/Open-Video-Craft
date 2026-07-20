import { Check, Clipboard, KeyRound, LoaderCircle, PlugZap, Trash2 } from "lucide-react";
import ClaudeCodeIcon from "@lobehub/icons/es/ClaudeCode/components/Color";
import type { AiConnectionProviderStatus, AiProvider } from "../../shared/types";

/** Claude Code provider card, visually aligned with the cloud API-key cards. */
export function AiProviderConnectionCard(props: {
  provider: AiConnectionProviderStatus;
  busy: AiProvider | "undo" | null;
  onConfigure: (provider: AiProvider, connected: boolean) => Promise<void>;
}) {
  const { provider } = props;
  const connectionDisabled = props.busy !== null || (
    !provider.configured && (!provider.installed || !provider.supported)
  );

  return (
    <article className="flex min-h-[12.5rem] min-w-0 flex-col overflow-hidden rounded-xl bg-[#18181b] shadow-[0_8px_28px_rgb(0_0_0_/_0.18)] transition-colors hover:bg-[#1c1c1f]" data-provider-card="claude">
      <div className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Claude Code</h3>
            {provider.configured ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[0.6rem] font-bold text-emerald-300">
                <Check size={10} /> Connected
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.68rem] leading-4 text-neutral-400">
            {provider.message ?? (provider.installed ? `CLI ${provider.version ?? "detected"}` : "Claude Code CLI is not installed yet.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-emerald-400/[0.09] px-2 py-1 text-[0.58rem] font-bold text-emerald-300">Video editing</span>
            <span className="rounded-full bg-sky-400/[0.09] px-2 py-1 text-[0.58rem] font-bold text-sky-300">Local CLI</span>
            <span className="rounded-full bg-amber-300/[0.09] px-2 py-1 text-[0.58rem] font-bold text-amber-200">Project tools</span>
          </div>
        </div>
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d97757]/10">
          <ClaudeCodeIcon size={27} />
        </span>
      </div>

      {!provider.installed ? (
        <div className="grid min-h-12 grid-cols-1 px-2 pb-2">
          <button
            className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white"
            type="button"
            onClick={() => void navigator.clipboard.writeText(provider.setupCommand)}
          >
            <Clipboard size={13} /> Copy setup command
          </button>
        </div>
      ) : provider.configured ? (
        <div className="grid min-h-12 grid-cols-2 gap-2 px-2 pb-2">
          <button
            className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45"
            type="button"
            disabled={props.busy !== null}
            onClick={() => void props.onConfigure(provider.provider, false)}
          >
            <PlugZap size={13} /> Reconnect
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-400 transition hover:bg-rose-400/[0.06] hover:text-rose-200 disabled:opacity-45"
            type="button"
            disabled={props.busy !== null}
            onClick={() => void props.onConfigure(provider.provider, true)}
          >
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      ) : (
        <div className="grid min-h-12 grid-cols-1 px-2 pb-2">
          <button
            className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45"
            type="button"
            disabled={connectionDisabled}
            onClick={() => void props.onConfigure(provider.provider, false)}
          >
            {props.busy === provider.provider
              ? <LoaderCircle className="animate-spin" size={14} />
              : <KeyRound size={13} />}
            Connect
          </button>
        </div>
      )}
    </article>
  );
}
