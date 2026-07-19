import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import type {
  AiConnectionStatus,
  AiProvider,
  ProviderKeysView,
  UpdateProviderKeysRequest
} from "../../shared/types";
import type { EditorMutation } from "../../shared/editor-domain";
import { AiLastEditCard } from "./AiLastEditCard";
import { AiProviderConnectionCard } from "./AiProviderConnectionCard";
import { ApiKeyCard } from "./ApiKeyCard";

export function AiConnectionDialog(props: {
  open: boolean;
  lastAgentEdit: EditorMutation | null;
  onClose: () => void;
  onUndo: () => Promise<void>;
  onProviderKeysChanged?: () => void;
}) {
  const [status, setStatus] = useState<AiConnectionStatus | null>(null);
  const [providerKeys, setProviderKeys] = useState<ProviderKeysView | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [busy, setBusy] = useState<AiProvider | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    void window.openVideoCraft.ai.getStatus().then((next) => {
      setStatus(next); setPrivacyAccepted(next.privacyAccepted);
    }).catch((loadError) => setError(String(loadError)));
    void window.openVideoCraft.providers.get().then(setProviderKeys).catch(() => undefined);
  }, [props.open]);

  const updateKeys = async (request: UpdateProviderKeysRequest) => {
    try {
      setProviderKeys(await window.openVideoCraft.providers.update(request));
      props.onProviderKeysChanged?.();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  };

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
    <div className="fixed inset-0 z-[80] grid min-h-0 place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="AI connection">
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#161618] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-white/[0.08] text-neutral-200"><Bot size={19} /></span>
            <h2 className="text-sm font-bold text-white">AI video editing</h2>
          </div>
          <button className="grid size-8 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white" onClick={props.onClose} type="button"><X size={17} /></button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-300">
            Analysis runs on this computer. When an AI client requests project context, timeline metadata, transcripts, and requested contact-sheet images are sent to that client and handled under its provider’s data policy. Raw video is never exposed automatically.
          </div>
          <label className="flex items-start gap-2.5 text-xs text-slate-300">
            <input className="mt-0.5 accent-violet-400" type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
            <span>I understand and want to allow connected AI clients to request derived project context.</span>
          </label>

          <div className="grid gap-3">
            {(status?.providers ?? []).filter((provider) => provider.provider !== "codex").map((provider) => (
              <AiProviderConnectionCard
                key={provider.provider}
                provider={provider}
                busy={busy}
                privacyAccepted={privacyAccepted}
                onConfigure={configure}
              />
            ))}
          </div>

          <div className="grid gap-1">
            <h3 className="text-xs font-bold text-white">Cloud API keys</h3>
            <p className="text-[0.68rem] leading-4 text-slate-400">
              Used for the built-in Gemini assistant, Lyria music generation, and cloud
              transcription. Keys are stored encrypted on this computer
              {providerKeys?.encryptionAvailable === false ? " (OS keychain unavailable — stored obfuscated only)" : ""} and never shown again.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ApiKeyCard
              title="Google Gemini"
              description="Powers the AI assistant chat, Gemini transcription, and Lyria 3 music."
              hasKey={providerKeys?.hasGeminiKey ?? false}
              keyUrl="https://aistudio.google.com/apikey"
              keyUrlLabel="Get a Gemini API key →"
              disabled={providerKeys === null}
              onSave={(apiKey) => updateKeys({ geminiApiKey: apiKey })}
              onClear={() => updateKeys({ geminiApiKey: null })}
            />
            <ApiKeyCard
              title="Cohere"
              description="Powers Cohere Transcribe for subtitles (14 languages)."
              hasKey={providerKeys?.hasCohereKey ?? false}
              keyUrl="https://dashboard.cohere.com/api-keys"
              keyUrlLabel="Get a Cohere API key →"
              disabled={providerKeys === null}
              onSave={(apiKey) => updateKeys({ cohereApiKey: apiKey })}
              onClear={() => updateKeys({ cohereApiKey: null })}
            />
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
          {error ? <p className="rounded bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
