/**
 * Masked API-key entry card for cloud providers (Gemini, Cohere). Keys are
 * stored encrypted in the main process and never read back into the renderer;
 * the card only knows whether a key is saved.
 */
import { useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";

export function ApiKeyCard(props: {
  title: string;
  description: string;
  hasKey: boolean;
  keyUrl: string;
  keyUrlLabel: string;
  disabled: boolean;
  onSave: (apiKey: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid content-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold text-white">
          <KeyRound size={14} className="text-slate-400" />
          {props.title}
        </span>
        {props.hasKey ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[0.62rem] font-bold text-emerald-300">
            <Check size={11} /> Key saved
          </span>
        ) : null}
      </div>
      <p className="text-[0.68rem] leading-4 text-slate-400">{props.description}</p>
      <button
        className="justify-self-start text-[0.68rem] font-bold text-violet-300 hover:underline"
        type="button"
        onClick={() => void window.openVideoCraft.app.openExternal(props.keyUrl)}
      >
        {props.keyUrlLabel}
      </button>
      <div className="flex gap-2">
        <input
          className="h-8 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 text-xs font-semibold text-white outline-none focus:border-violet-400"
          type="password"
          placeholder={props.hasKey ? "Replace saved key…" : "Paste API key…"}
          value={draft}
          disabled={props.disabled || busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="inline-flex h-8 items-center rounded-md border border-white/10 bg-white/[0.055] px-2.5 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
          type="button"
          disabled={props.disabled || busy || draft.trim().length === 0}
          onClick={() => void run(() => props.onSave(draft.trim()))}
        >
          Save
        </button>
        {props.hasKey ? (
          <button
            className="inline-flex h-8 items-center rounded-md border border-white/10 px-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
            type="button"
            title="Remove saved key"
            disabled={props.disabled || busy}
            onClick={() => void run(props.onClear)}
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
