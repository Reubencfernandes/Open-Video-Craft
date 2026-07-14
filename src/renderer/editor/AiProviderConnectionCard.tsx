import { Check, Clipboard, LoaderCircle } from "lucide-react";
import type { AiConnectionProviderStatus, AiProvider } from "../../shared/types";

/** One provider row; connection state and side effects stay in the parent dialog. */
export function AiProviderConnectionCard(props: {
  provider: AiConnectionProviderStatus;
  busy: AiProvider | "undo" | null;
  privacyAccepted: boolean;
  onConfigure: (provider: AiProvider, connected: boolean) => Promise<void>;
}) {
  const { provider } = props;
  const connectionDisabled = props.busy !== null || (
    !provider.configured && (!provider.installed || !provider.supported || !props.privacyAccepted)
  );

  return (
    <article className="rounded-lg border border-white/10 bg-black/15 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {provider.provider === "codex" ? "Codex" : "Claude Code"}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{provider.message ?? provider.version}</p>
        </div>
        {provider.configured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
            <Check size={11} /> Connected
          </span>
        ) : null}
      </div>

      <button
        className="h-8 w-full rounded bg-[#c9ad73] px-3 text-xs font-bold text-[#17130c] disabled:cursor-not-allowed disabled:opacity-45"
        type="button"
        disabled={connectionDisabled}
        onClick={() => void props.onConfigure(provider.provider, provider.configured)}
      >
        {props.busy === provider.provider
          ? <LoaderCircle className="mx-auto animate-spin" size={15} />
          : provider.configured ? "Disconnect" : "Connect"}
      </button>

      {!provider.installed ? (
        <button
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-white"
          type="button"
          onClick={() => void navigator.clipboard.writeText(provider.setupCommand)}
        >
          <Clipboard size={12} /> Copy setup command
        </button>
      ) : null}
    </article>
  );
}
