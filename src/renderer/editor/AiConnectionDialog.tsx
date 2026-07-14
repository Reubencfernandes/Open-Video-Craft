import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import type { AiConnectionStatus, AiProvider } from "../../shared/types";
import type { EditorMutation } from "../../shared/editor-domain";
import { AiLastEditCard } from "./AiLastEditCard";
import { AiProviderConnectionCard } from "./AiProviderConnectionCard";

export function AiConnectionDialog(props: {
  open: boolean;
  revision: number;
  lastAgentEdit: EditorMutation | null;
  onClose: () => void;
  onUndo: () => Promise<void>;
}) {
  const [status, setStatus] = useState<AiConnectionStatus | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [busy, setBusy] = useState<AiProvider | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    void window.openVideoCraft.ai.getStatus().then((next) => {
      setStatus(next); setPrivacyAccepted(next.privacyAccepted);
    }).catch((loadError) => setError(String(loadError)));
  }, [props.open]);

  if (!props.open) return null;

  const configure = async (provider: AiProvider, connected: boolean) => {
    setBusy(provider); setError(null);
    try {
      const next = connected
        ? await window.openVideoCraft.ai.disconnect(provider)
        : await window.openVideoCraft.ai.configure({ provider, privacyAccepted });
      setStatus(next);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="AI connection">
      <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#171a21] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-white/[0.08] text-neutral-200"><Bot size={19} /></span>
            <div><h2 className="text-sm font-bold text-white">AI video editing</h2><p className="text-xs text-slate-400">Project revision {props.revision}</p></div>
          </div>
          <button className="grid size-8 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white" onClick={props.onClose} type="button"><X size={17} /></button>
        </header>

        <div className="grid gap-4 p-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-300">
            Analysis runs on this computer. When an AI client requests project context, timeline metadata, transcripts, and requested contact-sheet images are sent to that client and handled under its provider’s data policy. Raw video is never exposed automatically.
          </div>
          <label className="flex items-start gap-2.5 text-xs text-slate-300">
            <input className="mt-0.5 accent-white" type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
            <span>I understand and want to allow connected AI clients to request derived project context.</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {(status?.providers ?? []).map((provider) => (
              <AiProviderConnectionCard
                key={provider.provider}
                provider={provider}
                busy={busy}
                privacyAccepted={privacyAccepted}
                onConfigure={configure}
              />
            ))}
          </div>

          {props.lastAgentEdit?.editId ? (
            <AiLastEditCard
              mutation={props.lastAgentEdit}
              disabled={busy !== null}
              onUndo={() => void (async () => {
                setBusy("undo");
                try { await props.onUndo(); }
                catch (undoError) { setError(String(undoError)); }
                finally { setBusy(null); }
              })()}
            />
          ) : null}
          {error ? <p className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
